import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  mp4DurationSeconds,
  parseHashManifest,
  validatePng,
  validateWebVtt,
  verifyPinnedHash,
} from "./submission-readiness";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = path.join(ROOT, "submission-assets");

const MASTER = {
  name: "alexandria-here-build-week-demo.mp4",
  bytes: 15_456_707,
  sha256: "ED270F6902CFA3AB96C0081E204A62670161E2E392DD470388306C9D57B3CA37",
  durationSeconds: 151.04,
  frames: 4_531,
} as const;

const SEALED_JSON = {
  "capture-manifest-v23.json": "92EAE9620EF3E40A0BB92229E6B73064485AE7AD8F9A20FE7B58AD5DE590545D",
  "narration-audit-v23.json": "D0FB7563F7F00C78E78A1C7AE9F2B954966838B18EAD9F043839FD32EB1E136A",
  "final-composition-plan-v23.json": "3748F584849C40F98779D0DD431C9274E0A3CA08396EF04820932281771DA7BC",
} as const;

const PUBLICATION_HASHES = {
  "07-youtube-thumbnail.png": "9D3BA06F82E7C7187BCCCD52D68AFD25D79F0EBF3060DED3DE306F0BF4AAF725",
  "08-devpost-cover.png": "CDEBA1AC93656D178B53A3D416283C75201D0E6B39667A4D18E943364B3E25D3",
  "09-devpost-gallery-iexile-returned.png": "4A5298D5C34714E33AF9C2127357CF488A1EB95B2E6430379A84B5D14BDD451F",
  "10-devpost-gallery-iexile-seams.png": "8FCB09512022734A21ED3C19FA53BD7E04007A372C025000728A7141516D4A68",
  "11-devpost-gallery-pathfinder-returned.png": "D84996DC402F9F80119972B7E2754E3BE7C0761A51D36923EE40A01F5415ED02",
  "12-devpost-gallery-pathfinder-timeline.png": "A87C1388FFA9CE1685C4C1268342FE224021EF09EFA0D0BD0549CBEA022E00C9",
  "13-devpost-gallery-pathfinder-absence.png": "3A25ACD400C4E7201EEB466F799A1AB9EA6886B90E0882FB1851252F6F3FB760",
  "14-devpost-gallery-witness-receipt.png": "4748BEF2294C2167E12E4983345B0E6C448BCCA0FB86AEE8A21B7E3299D42800",
} as const;

const CAPTIONS = {
  name: "alexandria-here-build-week-demo.en.vtt",
  sha256: "4E2089164CF12C0CEB68DE79D5A053214CA865D4B1CE3DBB616E0B5651C9FAC8",
  cues: 56,
  firstStartMs: 83,
  lastEndMs: 149_238,
} as const;

interface CompositionPlan {
  status?: unknown;
  clock?: { video_frames?: unknown; film_seconds?: unknown };
  captions?: { cue_count?: unknown; last_cue_seconds?: unknown };
  rendered?: { full_decode?: unknown; sha256?: unknown };
}

interface NarrationAudit {
  status?: unknown;
  disclosure?: unknown;
  audio?: { sample_rate_hz?: unknown; channels?: unknown };
  loudness?: { integrated_lufs?: unknown; true_peak_dbtp?: unknown };
}

interface CaptureManifest {
  runtime?: { version?: unknown; commit?: unknown };
  liveProofs?: Array<{ id?: unknown }>;
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function readSealed(filePath: string, expectedHash: string, expectedBytes?: number): Promise<Buffer> {
  const [bytes, info] = await Promise.all([readFile(filePath), stat(filePath)]);
  invariant(info.isFile(), `${filePath} is not a regular file`);
  if (expectedBytes !== undefined) invariant(info.size === expectedBytes, `${filePath} byte count drifted: ${info.size}`);
  verifyPinnedHash(bytes, expectedHash, path.basename(filePath));
  return bytes;
}

async function main(): Promise<void> {
  const master = await readSealed(path.join(ASSETS, MASTER.name), MASTER.sha256, MASTER.bytes);
  const duration = mp4DurationSeconds(master);
  invariant(Math.abs(duration - MASTER.durationSeconds) <= 0.001, `master duration drifted: ${duration}`);

  for (const [name, hash] of Object.entries(SEALED_JSON)) await readSealed(path.join(ASSETS, name), hash);

  const plan = JSON.parse(await readFile(path.join(ASSETS, "final-composition-plan-v23.json"), "utf8")) as CompositionPlan;
  invariant(plan.status === "complete", "composition plan is not complete");
  invariant(plan.clock?.video_frames === MASTER.frames, "composition frame count drifted");
  invariant(plan.clock?.film_seconds === MASTER.durationSeconds, "composition clock drifted");
  invariant(plan.captions?.cue_count === CAPTIONS.cues, "composition caption count drifted");
  invariant(plan.captions?.last_cue_seconds === CAPTIONS.lastEndMs / 1000, "composition caption end drifted");
  invariant(plan.rendered?.full_decode === "pass", "composition did not record a full-decode pass");
  invariant(String(plan.rendered?.sha256).toUpperCase() === MASTER.sha256, "composition master hash drifted");

  const narrationAudit = JSON.parse(await readFile(path.join(ASSETS, "narration-audit-v23.json"), "utf8")) as NarrationAudit;
  invariant(narrationAudit.status === "PASS", "narration audit did not pass");
  invariant(narrationAudit.disclosure === "Synthetic narration generated with Microsoft Edge TTS.", "narration disclosure drifted");
  invariant(narrationAudit.audio?.sample_rate_hz === 48_000 && narrationAudit.audio?.channels === 1, "audio format drifted");
  invariant(narrationAudit.loudness?.integrated_lufs === -16.01, "integrated loudness drifted");
  invariant(narrationAudit.loudness?.true_peak_dbtp === -1.5, "true peak drifted");

  const captionBytes = await readSealed(path.join(ASSETS, CAPTIONS.name), CAPTIONS.sha256);
  const cues = validateWebVtt(captionBytes.toString("utf8"), CAPTIONS.cues, Math.round(MASTER.durationSeconds * 1000));
  invariant(cues[0]?.startMs === CAPTIONS.firstStartMs, "first caption start drifted");
  invariant(cues.at(-1)?.endMs === CAPTIONS.lastEndMs, "last caption end drifted");

  const publicationNames = Object.keys(PUBLICATION_HASHES) as Array<keyof typeof PUBLICATION_HASHES>;
  const devpostNames = publicationNames.filter((name) => name !== "07-youtube-thumbnail.png");
  const manifestBytes = await readSealed(
    path.join(ASSETS, "devpost-media.sha256"),
    "4528B18BB67F10288E63C91ADD25E1DBFF4F483199D2304C29B92E483914F008",
  );
  const manifest = parseHashManifest(manifestBytes, devpostNames);
  for (const [index, name] of publicationNames.entries()) {
    const bytes = await readSealed(path.join(ASSETS, name), PUBLICATION_HASHES[name]);
    if (name !== "07-youtube-thumbnail.png") {
      invariant(manifest.get(name) === PUBLICATION_HASHES[name], `${name} manifest role drifted`);
    }
    validatePng(bytes, index === 0 ? 1280 : 1500, index === 0 ? 720 : 1000);
    invariant(bytes.length <= 5_000_000, `${name} exceeds the 5 MB Devpost ceiling`);
  }

  const capture = JSON.parse(await readFile(path.join(ASSETS, "capture-manifest-v23.json"), "utf8")) as CaptureManifest;
  invariant(capture.runtime?.version === 23, "capture runtime version drifted");
  invariant(capture.runtime?.commit === "65b39285520cf871df1081d6899b083af3edbd83", "capture runtime commit drifted");
  invariant(Array.isArray(capture.liveProofs) && capture.liveProofs.length === 2, "dual-example proof set drifted");
  invariant(capture.liveProofs[0]?.id === "18026989-33be-4011-86ee-19e1754cb22c", "iExile proof identity drifted");
  invariant(capture.liveProofs[1]?.id === "c6adb317-ee2f-4530-9298-e9eb5fe6efd2", "Pathfinder proof identity drifted");

  console.log(`PASS final v23 master ${MASTER.sha256}`);
  console.log(`PASS ${MASTER.frames} frames; ${duration.toFixed(3)} seconds; full decode recorded`);
  console.log(`PASS ${cues.length} caption cues; ${CAPTIONS.firstStartMs}-${CAPTIONS.lastEndMs} ms`);
  console.log(`PASS ${publicationNames.length} publication images; exact role hashes and geometry`);
  console.log("PASS iExile + Mars Pathfinder production capture provenance");
}

await main();
