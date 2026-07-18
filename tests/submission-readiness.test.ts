import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertCanonicalTiming,
  classifyChecklistItem,
  classifyYouTubeReference,
  inspectPng,
  mp4DurationSeconds,
  normalizedWords,
  parseHashManifest,
  readRegularFile,
  runSubmissionReadiness,
  sha256,
  submissionExitCode,
  validateCandidateNames,
  validatePng,
  validateWebVtt,
  verifyPinnedHash,
} from "../scripts/submission-readiness";

const root = process.cwd();
const assets = path.join(root, "submission-assets");

test("the sealed submission package passes locally and exposes only authority-gated work", async () => {
  const checks = await runSubmissionReadiness(root);
  assert.deepEqual(checks.filter((check) => check.state === "FAIL"), []);
  assert.deepEqual(
    checks.filter((check) => check.state === "PENDING").map((check) => check.name),
    ["Public YouTube URL", "Devpost media transmission", "Rules acceptance and final submit"],
  );
  assert.equal(submissionExitCode(checks), 0);
  assert.equal(submissionExitCode(checks, true), 1);
});

test("checksum manifests reject line-ending drift and role reordering", () => {
  const a = "A".repeat(64);
  const b = "B".repeat(64);
  const names = ["first.png", "second.png"];
  const valid = Buffer.from(`${a}  first.png\n${b}  second.png\n`, "ascii");
  assert.deepEqual([...parseHashManifest(valid, names).keys()], names);
  assert.throws(() => parseHashManifest(Buffer.from(valid.toString("ascii").replace(/\n/g, "\r\n"), "ascii"), names), /LF line endings/);
  assert.throws(() => parseHashManifest(Buffer.from(`${b}  second.png\n${a}  first.png\n`, "ascii"), names), /expected first\.png/);
  assert.throws(() => parseHashManifest(Buffer.from(`${a}  wrong.mp4\n`, "ascii"), ["master.mp4"]), /expected master\.mp4/);
  assert.throws(() => parseHashManifest(Buffer.from(`${a}  master.mp4\n${b}  extra.mp4\n`, "ascii"), ["master.mp4"]), /2 entries/);
});

test("a mutable sidecar cannot rebaseline content away from a pinned role hash", () => {
  const stale = Buffer.from("stale media");
  const mutableSidecar = Buffer.from(`${sha256(stale)}  master.mp4\n`, "ascii");
  assert.equal(parseHashManifest(mutableSidecar, ["master.mp4"]).get("master.mp4"), sha256(stale));
  assert.throws(() => verifyPinnedHash(stale, "A".repeat(64), "sealed master"), /expected A{64}/);
});

test("WebVTT validation is integer-timed, ordered, and fail-closed", () => {
  const valid = [
    "WEBVTT",
    "",
    "00:00:00.100 --> 00:00:00.900",
    "First cue.",
    "",
    "00:00:00.900 --> 00:00:01.500",
    "Second cue.",
    "",
  ].join("\n");
  const cues = validateWebVtt(valid, 2, 1500);
  assert.deepEqual(cues.map((cue) => [cue.startMs, cue.endMs]), [[100, 900], [900, 1500]]);
  assert.throws(() => validateWebVtt(valid.replace("00:00:00.900 --> 00:00:01.500", "00:00:00.899 --> 00:00:01.500"), 2, 1500), /overlap/);
  assert.throws(() => validateWebVtt(valid.replace("00:00:01.500", "00:00:01.501"), 2, 1500), /after the video/);
  assert.throws(() => validateWebVtt(valid, 3, 1500), /expected 3/);
  assert.throws(() => validateWebVtt(valid.replace("WEBVTT", "WEB-VTT"), 2, 1500), /begin with WEBVTT/);
  assert.throws(() => validateWebVtt(valid.replace("00:00:00.100 --> 00:00:00.900", "00:00:00.900 --> 00:00:00.100"), 2, 1500), /end after/);
  assert.throws(() => validateWebVtt(valid.replace("First cue.", ""), 2, 1500), /no text|timing line/);
});

test("PNG validation rejects a role-preserving geometry mutation", async () => {
  const thumbnail = await readFile(path.join(assets, "07-youtube-thumbnail.png"));
  const info = validatePng(thumbnail, 1280, 720);
  assert.equal(info.colorType, 2);
  const mutated = Buffer.from(thumbnail);
  mutated.writeUInt32BE(1279, 16);
  assert.equal(inspectPng(mutated).width, 1279);
  assert.throws(() => validatePng(mutated, 1280, 720), /expected 1280x720/);
  const wrongSignature = Buffer.from(thumbnail);
  wrongSignature[0] = 0;
  assert.throws(() => inspectPng(wrongSignature), /signature/);
  assert.throws(() => inspectPng(thumbnail.subarray(0, thumbnail.length - 1)), /IEND/);
  const withAlpha = Buffer.from(thumbnail);
  withAlpha[25] = 6;
  assert.throws(() => validatePng(withAlpha, 1280, 720), /color type 6/);
});

test("the MP4 parser reads the sealed master duration without external binaries", async () => {
  const master = await readFile(path.join(assets, "alexandria-here-build-week-demo.mp4"));
  assert.ok(Math.abs(mp4DurationSeconds(master) - 155.258) < 0.001);
  assert.throws(() => mp4DurationSeconds(master.subarray(8)), /ftyp|MP4 box/);
});

test("narration comparison tolerates punctuation but not changed words", () => {
  assert.deepEqual(normalizedWords("hostile-HTML — evidence"), normalizedWords("hostile HTML evidence"));
  assert.notDeepEqual(normalizedWords("evidence is present"), normalizedWords("evidence was present"));
});

test("YouTube reference state permits exactly one pending marker or one published URL", () => {
  assert.equal(classifyYouTubeReference("Demo: [ADD PUBLIC YOUTUBE URL — UNDER 3 MINUTES]"), "pending");
  assert.equal(classifyYouTubeReference("Demo: https://youtu.be/abc_123"), "present");
  assert.throws(() => classifyYouTubeReference("Demo: [TODO VIDEO]"), /unsupported placeholders/);
  assert.throws(() => classifyYouTubeReference("Demo: [ADD PUBLIC YOUTUBE URL — UNDER 3 MINUTES] https://youtu.be/abc_123"), /both/);
});

test("authority checklist items are exact, unique, and tri-state", () => {
  const label = "Perform the authority-gated action.";
  assert.equal(classifyChecklistItem(`- [ ] ${label}`, label), "pending");
  assert.equal(classifyChecklistItem(`- [x] ${label}`, label), "complete");
  assert.throws(() => classifyChecklistItem("", label), /exactly once/);
  assert.throws(() => classifyChecklistItem(`- [ ] ${label}\n- [ ] ${label}`, label), /exactly once/);
  assert.throws(() => classifyChecklistItem(`- [ ] ${label}\n- [x] ${label}`, label), /exactly once/);
  assert.throws(() => classifyChecklistItem(`- [ ] Perform a reworded action.`, label), /exactly once/);
});

test("canonical timing rejects alternate runtime and deadline claims", () => {
  const valid = "Runtime: less than 3:00. Submit July 21, 2026 at 5:00 PM PDT (Pacific Time).";
  assert.doesNotThrow(() => assertCanonicalTiming(valid, "fixture"));
  for (const contradiction of ["at most 3:00", "3:00 or under", "3 minutes or under", "three minutes or less", "no more than 3 minutes", "≤ 3:00"]) {
    assert.throws(() => assertCanonicalTiming(`${valid} Also ${contradiction}.`, "fixture"), /runtime/);
  }
  assert.throws(() => assertCanonicalTiming(`${valid} Alternate July 21, 2026 at 4:00 PM PDT (Pacific Time).`, "fixture"), /deadline/);
});

test("candidate roles reject stale alternates and final mode passes only explicit completion", () => {
  validateCandidateNames(["08-devpost-cover.png", "09-devpost-gallery.png"], ["08-devpost-cover.png", "09-devpost-gallery.png"], "fixture");
  assert.throws(() => validateCandidateNames(["08-devpost-cover-old.png", "08-devpost-cover.png"], ["08-devpost-cover.png"], "fixture"), /candidates/);
  assert.equal(submissionExitCode([{ section: "External authority", name: "done", state: "PASS", detail: "explicit" }], true), 0);
});

test("regular-file limits are checked before reads, including decimal 5 MB", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "alexandria-submission-test-"));
  try {
    const exact = path.join(temporary, "exact.bin");
    const tooLarge = path.join(temporary, "too-large.bin");
    const directory = path.join(temporary, "directory");
    await Promise.all([
      writeFile(exact, Buffer.alloc(5_000_000)),
      writeFile(tooLarge, Buffer.alloc(5_000_001)),
      mkdir(directory),
    ]);
    assert.equal((await readRegularFile(exact, { maxBytes: 5_000_000 })).length, 5_000_000);
    await assert.rejects(readRegularFile(tooLarge, { maxBytes: 5_000_000 }), /exceeds 5000000/);
    await assert.rejects(readRegularFile(directory), /regular, non-symlink/);
    const link = path.join(temporary, "link.bin");
    try {
      await symlink(exact, link, "file");
      await assert.rejects(readRegularFile(link), /regular, non-symlink/);
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      if (!new Set(["EPERM", "EACCES", "ENOSYS"]).has(code)) throw error;
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
