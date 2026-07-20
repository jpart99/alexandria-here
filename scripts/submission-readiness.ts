import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type GateState = "PASS" | "FAIL" | "PENDING";

export interface SubmissionCheck {
  section: "Media integrity" | "Submission contracts" | "External authority";
  name: string;
  state: GateState;
  detail: string;
}

interface PngInfo {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  chunkTypes: string[];
}

interface VttCue {
  startMs: number;
  endMs: number;
  text: string;
}

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VIDEO_NAME = "alexandria-here-build-week-demo.mp4";
const VIDEO_HASH: string = "ED270F6902CFA3AB96C0081E204A62670161E2E392DD470388306C9D57B3CA37";
const PLACEHOLDER_VIDEO_HASH = "B2EA9AFC1967B0BA6CC0B06BFC2E628ABB09BD237D0145D5F9A84C4BB04583BA";
const VIDEO_BYTES = 15_456_707;
const VIDEO_DURATION_SECONDS = 151.04;
const VIDEO_FRAMES = 4_531;
const CAPTIONS_NAME = "alexandria-here-build-week-demo.en.vtt";
const CAPTIONS_HASH = "4E2089164CF12C0CEB68DE79D5A053214CA865D4B1CE3DBB616E0B5651C9FAC8";
const YOUTUBE_THUMBNAIL_NAME = "07-youtube-thumbnail.png";
const YOUTUBE_THUMBNAIL_HASH = "9D3BA06F82E7C7187BCCCD52D68AFD25D79F0EBF3060DED3DE306F0BF4AAF725";
const YOUTUBE_THUMBNAIL_BYTES = 177_061;
const YOUTUBE_TITLE = "Alexandria Here — A Witnessed Restoration Engine for the Lost Web | OpenAI Build Week";
const DEVPOST_MANIFEST_HASH: string = "4528B18BB67F10288E63C91ADD25E1DBFF4F483199D2304C29B92E483914F008";
const FINAL_MEDIA_PROVENANCE_HASHES = {
  "capture-manifest-v23.json": "92EAE9620EF3E40A0BB92229E6B73064485AE7AD8F9A20FE7B58AD5DE590545D",
  "narration-audit-v23.json": "D0FB7563F7F00C78E78A1C7AE9F2B954966838B18EAD9F043839FD32EB1E136A",
  "final-composition-plan-v23.json": "3748F584849C40F98779D0DD431C9274E0A3CA08396EF04820932281771DA7BC",
} as const;
const PLACEHOLDER_DEVPOST_MANIFEST_HASH = "8E2B40BD2FCC8D7274B994AF7C9C7FDDFBF92F468D2D3E6E4779C9801CC8A044";
const DEVPOST_MAX_BYTES = 5_000_000;
const DEVPOST_NAMES = [
  "08-devpost-cover.png",
  "09-devpost-gallery-iexile-returned.png",
  "10-devpost-gallery-iexile-seams.png",
  "11-devpost-gallery-pathfinder-returned.png",
  "12-devpost-gallery-pathfinder-timeline.png",
  "13-devpost-gallery-pathfinder-absence.png",
  "14-devpost-gallery-witness-receipt.png",
] as const;
const DEVPOST_HASHES: Readonly<Record<(typeof DEVPOST_NAMES)[number], string>> = {
  "08-devpost-cover.png": "CDEBA1AC93656D178B53A3D416283C75201D0E6B39667A4D18E943364B3E25D3",
  "09-devpost-gallery-iexile-returned.png": "4A5298D5C34714E33AF9C2127357CF488A1EB95B2E6430379A84B5D14BDD451F",
  "10-devpost-gallery-iexile-seams.png": "8FCB09512022734A21ED3C19FA53BD7E04007A372C025000728A7141516D4A68",
  "11-devpost-gallery-pathfinder-returned.png": "D84996DC402F9F80119972B7E2754E3BE7C0761A51D36923EE40A01F5415ED02",
  "12-devpost-gallery-pathfinder-timeline.png": "A87C1388FFA9CE1685C4C1268342FE224021EF09EFA0D0BD0549CBEA022E00C9",
  "13-devpost-gallery-pathfinder-absence.png": "3A25ACD400C4E7201EEB466F799A1AB9EA6886B90E0882FB1851252F6F3FB760",
  "14-devpost-gallery-witness-receipt.png": "4748BEF2294C2167E12E4983345B0E6C448BCCA0FB86AEE8A21B7E3299D42800",
};
const GALLERY_NAMES = DEVPOST_NAMES.slice(1);
const YOUTUBE_CHAPTERS = [0, 11, 30, 48, 70, 96, 122, 140] as const;
const PRODUCTION_URL = "https://alexandria-here.cinemaexile.chatgpt.site";
const RECOVERY_ID = "18026989-33be-4011-86ee-19e1754cb22c";
const RECOVERY_URL = `${PRODUCTION_URL}/r/${RECOVERY_ID}`;
const RECEIPT_URL = `${PRODUCTION_URL}/api/recover/${RECOVERY_ID}/receipt`;
const PATHFINDER_RECOVERY_ID = "c6adb317-ee2f-4530-9298-e9eb5fe6efd2";
const PATHFINDER_RECOVERY_URL = `${PRODUCTION_URL}/r/${PATHFINDER_RECOVERY_ID}`;
const PATHFINDER_RECEIPT_URL = `${PRODUCTION_URL}/api/recover/${PATHFINDER_RECOVERY_ID}/receipt`;
const PATHFINDER_MANIFEST_HASH = "03f1c3db3e60688b95faf3b25589cb6610b2697369f9c7ee39fc41ec9a6215ab";
const PATHFINDER_SAFE_CLAIM = "a historic Mars Pathfinder mission site returned from surviving public witnesses";
const PATHFINDER_PROOF_PHRASES = [
  PATHFINDER_RECOVERY_URL,
  PATHFINDER_RECEIPT_URL,
  PATHFINDER_MANIFEST_HASH,
  PATHFINDER_SAFE_CLAIM,
  "8 captures",
  "7 Preserved pages plus 1 Missing state",
  "249 rendered / 250 preserved blocks",
  "3 inferred edges",
  "8 known absences",
  "planner `gpt-5.6`",
  "model `gpt-5.6-sol`",
  "12/12 validations",
] as const;
const VIDEO_CAPTURE_RECOVERY_ID = "8ea53a47-437b-4afe-ad2c-29c81637a327";
const VIDEO_CAPTURE_RECOVERY_URL = `${PRODUCTION_URL}/r/${VIDEO_CAPTURE_RECOVERY_ID}`;
const VIDEO_CAPTURE_FAIL_CLOSED_CLAIM = "The historical video-capture row now fails closed under the current evidence-replay validator; its machine receipt is unavailable.";
const REPOSITORY_URL = "https://github.com/jpart99/alexandria-here";
const SESSION_ID = "019f7304-e394-7f11-ba64-26e415135ff6";
const CURRENT_RUNTIME_COMMIT = "65b39285520cf871df1081d6899b083af3edbd83";
const PROOF_RUNTIME_COMMIT = "042215042dd46ded14b501f961f4d9e7debb8178";
const HISTORICAL_COMPATIBILITY_COMMIT = "f7f8f529285ed9e01fdbe02e868833fc86de5475";
const HISTORICAL_PROBE_ID = "6e467987-af60-4153-8d27-7653f56475aa";
const HISTORICAL_V8_FAIL_CLOSED_CLAIM = "The historical version-8 probe now fails closed under the current evidence-replay validator; its machine receipt is unavailable.";
const HISTORICAL_911_ID = "de5bb377-5b53-4ea4-b074-feb106e02113";
const HISTORICAL_911_FAIL_CLOSED_CLAIM = "The historical 9/11 Commission row now fails closed under the current evidence-replay validator; its machine receipt is unavailable.";
const HISTORICAL_V16_RUNTIME_COMMIT = "d32ab887e880d7f3d4bbf1c9d71e0aec37388a43";
const HISTORICAL_V16_SITES_VERSION_ID = "appgprj_6a5b165146ec8191a6507491526ca6eb~appgver_76f67dace6088191b2b415d5e4b1d17b";
const HISTORICAL_V16_DEPLOYMENT_ID = "appgdep_6a5c90b3020c81919c73b5a84e39580e";
const HISTORICAL_V17_RUNTIME_COMMIT = "c7112dbf9edde6531b02f1e6e3547667fa6f8003";
const HISTORICAL_V17_SITES_VERSION_ID = "appgprj_6a5b165146ec8191a6507491526ca6eb~appgver_a32fbc5b2a0481919cede26452bc7033";
const HISTORICAL_V17_DEPLOYMENT_ID = "appgdep_6a5ca4a4cc788191924a28d69120d106";
const HISTORICAL_V18_RUNTIME_COMMIT = "174e05a38d5a49a17d5d116cb79f8a3c53963286";
const HISTORICAL_V18_SITES_VERSION_ID = "appgprj_6a5b165146ec8191a6507491526ca6eb~appgver_29be18fd06788191b4499c75b4bdabad";
const HISTORICAL_V18_DEPLOYMENT_ID = "appgdep_6a5caab525508191ac8eb45c0b3e7fae";
const HISTORICAL_V19_RUNTIME_COMMIT = "88a4dce91b42a3fcc1d2adf9710de6bea651dfc4";
const HISTORICAL_V19_SITES_VERSION_ID = "appgprj_6a5b165146ec8191a6507491526ca6eb~appgver_d92c137f12788191bf5e69709b3809df";
const HISTORICAL_V19_DEPLOYMENT_ID = "appgdep_6a5ccae8dcf48191b85e5a80613dc594";
const HISTORICAL_V20_RUNTIME_COMMIT = "6c7d8df04db7c9b4ac56b05e61b367f1b025d529";
const HISTORICAL_V20_SITES_VERSION_ID = "appgprj_6a5b165146ec8191a6507491526ca6eb~appgver_e0e0becb32ec8191aaec526418590d31";
const HISTORICAL_V20_DEPLOYMENT_ID = "appgdep_6a5d33a6af448191ab4ba6a7eeaf0b63";
const HISTORICAL_V22_RUNTIME_COMMIT = "8291a2ef5d92503349ba7346cc9c3f6d1de3b17a";
const HISTORICAL_V22_SITES_VERSION_ID = "appgprj_6a5b165146ec8191a6507491526ca6eb~appgver_1f55f0478180819189cd0b2b8d97186b";
const HISTORICAL_V22_DEPLOYMENT_ID = "appgdep_6a5d42d6ba9481918078b196f495ada1";
const CURRENT_SITES_VERSION_ID = "appgprj_6a5b165146ec8191a6507491526ca6eb~appgver_bf2e23910c90819193de0e5adf1b785d";
const CURRENT_DEPLOYMENT_ID = "appgdep_6a5d57fbccb08191b868daeaf3d8e0d8";
const IEXILE_RESCUE_ID = "52a87f55-914f-4f17-a2b3-40021351f442";
const FRESH_V18_RECOVERY_ID = "ec9ab849-611a-4644-86d9-2ef82de1c61e";
const FRESH_V18_MANIFEST_HASH = "c615fc3375be9a0d7c10e8fd3753fc9f29701d54f7901ccfd5db94a867f4ec3c";
const CURRENT_RUNTIME_CLAIM = `Production version 23 at audited runtime commit \`${CURRENT_RUNTIME_COMMIT}\` passes 100 tests`;
const CURRENT_SITES_RECORD_CLAIM = `The accepted Sites record is saved version \`${CURRENT_SITES_VERSION_ID}\`, deployment \`${CURRENT_DEPLOYMENT_ID}\`, environment revision 7.`;
const PROOF_RUNTIME_CLAIM = `The judging recovery above was generated by proof-producing version 7 runtime \`${PROOF_RUNTIME_COMMIT}\`; current production Sites version 23 serves and audits that persisted receipt 1.0 row but did not generate its GPT-5.6 decisions.`;
const HISTORICAL_COMPATIBILITY_CLAIM = `Historical compatibility release v8 used runtime commit \`${HISTORICAL_COMPATIBILITY_COMMIT}\`; its ordinary schema/model probe is recovery \`${HISTORICAL_PROBE_ID}\`.`;
const HISTORICAL_V16_RELEASE_CLAIM = `Historical Sites release v16 used runtime commit \`${HISTORICAL_V16_RUNTIME_COMMIT}\`, saved version \`${HISTORICAL_V16_SITES_VERSION_ID}\`, deployment \`${HISTORICAL_V16_DEPLOYMENT_ID}\`, and environment revision 7; its source gate passed 91 tests.`;
const HISTORICAL_V17_RELEASE_CLAIM = `Historical Sites release v17 used runtime commit \`${HISTORICAL_V17_RUNTIME_COMMIT}\`, saved version \`${HISTORICAL_V17_SITES_VERSION_ID}\`, deployment \`${HISTORICAL_V17_DEPLOYMENT_ID}\`, and environment revision 7.`;
const HISTORICAL_V18_RELEASE_CLAIM = `Historical Sites release v18 used runtime commit \`${HISTORICAL_V18_RUNTIME_COMMIT}\`, saved version \`${HISTORICAL_V18_SITES_VERSION_ID}\`, deployment \`${HISTORICAL_V18_DEPLOYMENT_ID}\`, and environment revision 7; its source gate passed 93 tests.`;
const HISTORICAL_V19_RELEASE_CLAIM = `Historical Sites release v19 used runtime commit \`${HISTORICAL_V19_RUNTIME_COMMIT}\`, saved version \`${HISTORICAL_V19_SITES_VERSION_ID}\`, deployment \`${HISTORICAL_V19_DEPLOYMENT_ID}\`, and environment revision 7; its source gate passed 96 tests.`;
const HISTORICAL_V20_RELEASE_CLAIM = `Historical Sites release v20 used runtime commit \`${HISTORICAL_V20_RUNTIME_COMMIT}\`, saved version \`${HISTORICAL_V20_SITES_VERSION_ID}\`, deployment \`${HISTORICAL_V20_DEPLOYMENT_ID}\`, and environment revision 7; its source gate passed 99 tests and its full eight-boundary compiled failure matrix passed.`;
const REJECTED_V21_CLAIM = "Sites version 21 was rejected because its packaged `dist` was stale. It was never accepted as production.";
const HISTORICAL_V22_RELEASE_CLAIM = `Historical Sites release v22 used runtime commit \`${HISTORICAL_V22_RUNTIME_COMMIT}\`, saved version \`${HISTORICAL_V22_SITES_VERSION_ID}\`, deployment \`${HISTORICAL_V22_DEPLOYMENT_ID}\`, and environment revision 7; its deployment-time source gate passed 99 tests and its full eight-boundary compiled failure matrix passed.`;
const IEXILE_RESCUE_CLAIM = `Production version 18 restored ordinary production recovery \`${IEXILE_RESCUE_ID}\` to HTTP 200 without rewriting its receipt 1.3 manifest or relabeling its \`insufficient_evidence\` outcome.`;
const FRESH_V18_RECOVERY_CLAIM = `Fresh ordinary production recovery \`${FRESH_V18_RECOVERY_ID}\``;
const FRESH_V18_MANIFEST_CLAIM = `manifest hash \`${FRESH_V18_MANIFEST_HASH}\``;
const FRESH_V18_MODEL_CLAIM = "planner `gpt-5.6`, model `gpt-5.6-sol`";
const HISTORICAL_V16_MATRIX_CLAIM = "The exact final version 16 failure-matrix rerun was externally blocked because public Wayback CDX returned zero bytes or timed out; no timeout was relaxed.";
const CURRENT_MATRIX_CLAIM = "Production version 23 passed the full eight-boundary compiled failure matrix.";
const EXAMPLE_SCOPE_CLAIM = "iExile is one witnessed production proof, not Alexandria's product boundary. Alexandria's product is the lost public web wherever surviving witnesses exist.";
const FINAL_MEDIA_CLAIM = "The final dual-example version 23 media package is locally audited and integrity-pinned; public YouTube publication and Devpost synchronization remain pending.";
const FINAL_MEDIA_SEAL_CLAIM = `The final master is 2:31.04 at 1920×1080 and 30 fps (${VIDEO_FRAMES} frames), with 56 exact English caption cues ending at 2:29.238, normalized 48 kHz synthetic narration, and SHA-256 \`${VIDEO_HASH}\`.`;
const DEVPOST_MEDIA_STATUS_CLAIM = "Status: final version 23 media is locally audited; public YouTube replacement, Devpost synchronization, rules acceptance, and final submission remain pending.";
const YOUTUBE_RUNTIME_CLAIM = `The current recovery and receipt links point to the corrected decision-attribution proof generated by version 7 runtime \`${PROOF_RUNTIME_COMMIT}\`; accepted production Sites version 23 runtime \`${CURRENT_RUNTIME_COMMIT}\` currently serves that persisted receipt 1.0 proof without claiming to have generated it.`;
const HISTORICAL_YOUTUBE_URL = "https://youtu.be/z1FJLdJS93o";
const HISTORICAL_PUBLICATION_CLAIM = `The earlier public video at ${HISTORICAL_YOUTUBE_URL} is retained only as historical publication provenance until the audited final video is published and verified.`;
const YOUTUBE_PLACEHOLDER = "[ADD FINAL PUBLIC YOUTUBE URL — UNDER 3 MINUTES]";
// Set this once, and only once, after signed-out verification of the final upload.
const FINAL_YOUTUBE_URL = "";
const FINAL_YOUTUBE_REFERENCE = FINAL_YOUTUBE_URL || YOUTUBE_PLACEHOLDER;
const YOUTUBE_URL_PATTERN = /https:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[A-Za-z0-9_-]+/;
const CHECKLIST = {
  youtubeUpload: "Upload the locally audited final version 23 video, captions, and thumbnail as one sealed set.",
  youtubeVerify: "Verify the final public YouTube page exposes 1080p, audio, captions, and embedding, then replace the Devpost video URL and verify its embedded player.",
  devpostText: "Replace the saved Devpost About and judge instructions with the version 23 `DEVPOST_FIELD_COPY.md`, save, then verify Preview shows `100 passing tests`, the current runtime, and both presentation recoveries.",
  devpostMedia: "Upload the final version 23 Devpost thumbnail and gallery media, then verify the public preview.",
  rules: "Jaia personally accepts the official-rules checkbox immediately before submission.",
  submit: "Submit before July 21, 2026 at 5:00 PM PDT (Pacific Time).",
} as const;

function fail(message: string): never {
  throw new Error(message);
}

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex").toUpperCase();
}

export function verifyPinnedHash(bytes: Uint8Array, expectedHash: string, label: string): void {
  const actual = sha256(bytes);
  if (actual !== expectedHash) fail(`${label} hash is ${actual}; expected ${expectedHash}`);
}

export async function readRegularFile(
  filePath: string,
  limits: { exactBytes?: number; maxBytes?: number } = {},
): Promise<Buffer> {
  const fileStat = await lstat(filePath);
  if (!fileStat.isFile() || fileStat.isSymbolicLink()) fail(`${filePath} must be a regular, non-symlink file`);
  if (limits.exactBytes !== undefined && fileStat.size !== limits.exactBytes) {
    fail(`${filePath} is ${fileStat.size} bytes; expected ${limits.exactBytes}`);
  }
  if (limits.maxBytes !== undefined && fileStat.size > limits.maxBytes) {
    fail(`${filePath} is ${fileStat.size} bytes; exceeds ${limits.maxBytes}`);
  }
  const bytes = await readFile(filePath);
  if (bytes.length !== fileStat.size) fail(`${filePath} changed while it was being read`);
  return bytes;
}

export function validateCandidateNames(actual: readonly string[], expected: readonly string[], label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label} candidates are ${actual.join(", ") || "none"}; expected ${expected.join(", ")}`);
  }
}

export function parseHashManifest(bytes: Buffer, expectedNames: readonly string[]): Map<string, string> {
  const raw = bytes.toString("ascii");
  if (raw.includes("\r")) fail("checksum manifest must use LF line endings");
  if (!raw.endsWith("\n")) fail("checksum manifest must end with LF");
  const lines = raw.slice(0, -1).split("\n");
  if (lines.length !== expectedNames.length) {
    fail(`checksum manifest has ${lines.length} entries; expected ${expectedNames.length}`);
  }

  const parsed = new Map<string, string>();
  lines.forEach((line, index) => {
    const match = /^([A-F0-9]{64})  ([A-Za-z0-9._-]+)$/.exec(line);
    if (!match) fail(`checksum manifest line ${index + 1} is malformed`);
    const [, digest, name] = match;
    if (name !== expectedNames[index]) {
      fail(`checksum manifest entry ${index + 1} is ${name}; expected ${expectedNames[index]}`);
    }
    if (parsed.has(name)) fail(`checksum manifest repeats ${name}`);
    parsed.set(name, digest);
  });
  return parsed;
}

export function inspectPng(bytes: Buffer): PngInfo {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(signature)) fail("invalid PNG signature");

  let offset = 8;
  const chunkTypes: string[] = [];
  let width = 0;
  let height = 0;
  let bitDepth = -1;
  let colorType = -1;
  let sawIend = false;

  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const next = dataStart + length + 4;
    if (next > bytes.length) fail(`PNG ${type || "chunk"} exceeds file bounds`);
    chunkTypes.push(type);

    if (chunkTypes.length === 1) {
      if (type !== "IHDR" || length !== 13) fail("PNG must begin with a 13-byte IHDR");
      width = bytes.readUInt32BE(dataStart);
      height = bytes.readUInt32BE(dataStart + 4);
      bitDepth = bytes[dataStart + 8];
      colorType = bytes[dataStart + 9];
      if (bytes[dataStart + 10] !== 0 || bytes[dataStart + 11] !== 0 || bytes[dataStart + 12] !== 0) {
        fail("PNG uses unsupported compression, filtering, or interlacing");
      }
    }

    offset = next;
    if (type === "IEND") {
      if (length !== 0) fail("PNG IEND must be empty");
      sawIend = true;
      break;
    }
  }

  if (!sawIend || offset !== bytes.length) fail("PNG must end exactly at IEND");
  if (!chunkTypes.includes("IDAT")) fail("PNG contains no image data");
  const unexpected = chunkTypes.filter((type) => !["IHDR", "IDAT", "IEND"].includes(type));
  if (unexpected.length) fail(`PNG contains metadata or unexpected chunks: ${unexpected.join(", ")}`);
  return { width, height, bitDepth, colorType, chunkTypes };
}

export function validatePng(bytes: Buffer, width: number, height: number): PngInfo {
  const info = inspectPng(bytes);
  if (info.width !== width || info.height !== height) {
    fail(`PNG is ${info.width}x${info.height}; expected ${width}x${height}`);
  }
  if (info.bitDepth !== 8 || info.colorType !== 2) {
    fail(`PNG must be 8-bit RGB; found bit depth ${info.bitDepth}, color type ${info.colorType}`);
  }
  return info;
}

interface Mp4Box {
  type: string;
  dataStart: number;
  end: number;
}

function mp4Boxes(bytes: Buffer, start: number, end: number): Mp4Box[] {
  const boxes: Mp4Box[] = [];
  let offset = start;
  while (offset + 8 <= end) {
    let size = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    let headerSize = 8;
    if (size === 1) {
      if (offset + 16 > end) fail(`truncated extended MP4 box ${type}`);
      const extended = bytes.readBigUInt64BE(offset + 8);
      if (extended > BigInt(Number.MAX_SAFE_INTEGER)) fail(`MP4 box ${type} is too large`);
      size = Number(extended);
      headerSize = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < headerSize || offset + size > end) fail(`invalid MP4 box ${type}`);
    boxes.push({ type, dataStart: offset + headerSize, end: offset + size });
    offset += size;
  }
  if (offset !== end) fail("MP4 box table has trailing bytes");
  return boxes;
}

export function mp4DurationSeconds(bytes: Buffer): number {
  const topLevel = mp4Boxes(bytes, 0, bytes.length);
  if (topLevel[0]?.type !== "ftyp") fail("MP4 must begin with an ftyp box");
  const moov = topLevel.find((box) => box.type === "moov");
  if (!moov) fail("MP4 contains no moov box");
  const mvhd = mp4Boxes(bytes, moov.dataStart, moov.end).find((box) => box.type === "mvhd");
  if (!mvhd) fail("MP4 contains no movie header");
  const version = bytes[mvhd.dataStart];
  let timescale: number;
  let duration: number;
  if (version === 0) {
    if (mvhd.dataStart + 20 > mvhd.end) fail("truncated version 0 movie header");
    timescale = bytes.readUInt32BE(mvhd.dataStart + 12);
    duration = bytes.readUInt32BE(mvhd.dataStart + 16);
  } else if (version === 1) {
    if (mvhd.dataStart + 32 > mvhd.end) fail("truncated version 1 movie header");
    timescale = bytes.readUInt32BE(mvhd.dataStart + 20);
    const wideDuration = bytes.readBigUInt64BE(mvhd.dataStart + 24);
    if (wideDuration > BigInt(Number.MAX_SAFE_INTEGER)) fail("MP4 duration is too large");
    duration = Number(wideDuration);
  } else {
    fail(`unsupported movie header version ${version}`);
  }
  if (!timescale || !duration) fail("MP4 has an empty timescale or duration");
  return duration / timescale;
}

function vttTimestampMs(value: string): number {
  const match = /^(\d{2}):(\d{2}):(\d{2})\.(\d{3})$/.exec(value);
  if (!match) fail(`invalid WebVTT timestamp ${value}`);
  const [, hours, minutes, seconds, milliseconds] = match.map(Number);
  if (minutes >= 60 || seconds >= 60) fail(`out-of-range WebVTT timestamp ${value}`);
  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + milliseconds;
}

export function validateWebVtt(raw: string, expectedCount = 56, maximumEndMs = Math.round(VIDEO_DURATION_SECONDS * 1000)): VttCue[] {
  if (raw.includes("\uFFFD")) fail("WebVTT contains replacement characters");
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  if (lines[0] !== "WEBVTT") fail("captions must begin with WEBVTT");
  const cues: VttCue[] = [];
  let index = 1;

  while (index < lines.length) {
    while (index < lines.length && !lines[index].trim()) index += 1;
    if (index >= lines.length) break;
    if (lines[index].startsWith("NOTE")) {
      while (index < lines.length && lines[index].trim()) index += 1;
      continue;
    }
    if (!lines[index].includes("-->")) index += 1;
    if (index >= lines.length) fail("WebVTT cue identifier has no timing line");
    const timing = /^(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})$/.exec(lines[index]);
    if (!timing) fail(`invalid WebVTT timing line: ${lines[index]}`);
    const startMs = vttTimestampMs(timing[1]);
    const endMs = vttTimestampMs(timing[2]);
    index += 1;
    const body: string[] = [];
    while (index < lines.length && lines[index].trim()) {
      body.push(lines[index]);
      index += 1;
    }
    if (!body.length) fail("WebVTT cue has no text");
    if (endMs <= startMs) fail("WebVTT cue must end after it starts");
    const previous = cues.at(-1);
    if (previous && startMs < previous.endMs) fail("WebVTT cues overlap or are out of order");
    if (endMs > maximumEndMs) fail(`WebVTT cue ends at ${endMs} ms, after the video`);
    cues.push({ startMs, endMs, text: body.join("\n") });
  }

  if (cues.length !== expectedCount) fail(`WebVTT has ${cues.length} cues; expected ${expectedCount}`);
  return cues;
}

export function normalizedWords(raw: string): string[] {
  return raw
    .toLocaleLowerCase("en-US")
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function assertSameWords(left: string, right: string, label: string): void {
  const leftWords = normalizedWords(left);
  const rightWords = normalizedWords(right);
  if (leftWords.length !== rightWords.length || leftWords.some((word, index) => word !== rightWords[index])) {
    const firstDifference = leftWords.findIndex((word, index) => word !== rightWords[index]);
    fail(`${label} differs at word ${firstDifference < 0 ? Math.min(leftWords.length, rightWords.length) + 1 : firstDifference + 1}`);
  }
}

export function assertOrdered(haystack: string, needles: readonly string[], label: string): void {
  let offset = -1;
  for (const needle of needles) {
    const index = haystack.indexOf(needle, offset + 1);
    if (index < 0) fail(`${label} is missing ${needle}`);
    if (index <= offset) fail(`${label} has an invalid order near ${needle}`);
    offset = index;
  }
}

export function classifyYouTubeReference(submission: string): "pending" | "present" {
  const placeholders = submission.match(/\[(?:ADD|TODO|TBD)[^\]]*\]/g) ?? [];
  const hasAllowedPlaceholder = placeholders.length === 1 && placeholders[0] === YOUTUBE_PLACEHOLDER;
  const finalReferenceSurface = submission.replaceAll(HISTORICAL_YOUTUBE_URL, "");
  const hasYouTubeUrl = YOUTUBE_URL_PATTERN.test(finalReferenceSurface);
  if (placeholders.some((placeholder) => placeholder !== YOUTUBE_PLACEHOLDER) || placeholders.length > 1) {
    fail(`submission contains unsupported placeholders: ${placeholders.join(", ")}`);
  }
  if (hasAllowedPlaceholder && hasYouTubeUrl) fail("submission contains both the pending marker and a YouTube URL");
  if (hasAllowedPlaceholder) return "pending";
  if (!placeholders.length && hasYouTubeUrl) return "present";
  fail("submission contains neither the sole allowed pending marker nor a YouTube URL");
}

export function classifyChecklistItem(submission: string, label: string): "pending" | "complete" {
  const lines = submission.split(/\r?\n/);
  const pendingLine = `- [ ] ${label}`;
  const completeLine = `- [x] ${label}`;
  const pendingCount = lines.filter((line) => line === pendingLine).length;
  const completeCount = lines.filter((line) => line === completeLine).length;
  if (pendingCount === 1 && completeCount === 0) return "pending";
  if (completeCount === 1 && pendingCount === 0) return "complete";
  fail(`checklist item must appear exactly once as [ ] or [x]: ${label}`);
}

export function classifyDevpostSynchronization(submission: string): "pending" | "complete" {
  const textState = classifyChecklistItem(submission, CHECKLIST.devpostText);
  const mediaState = classifyChecklistItem(submission, CHECKLIST.devpostMedia);
  return textState === "complete" && mediaState === "complete" ? "complete" : "pending";
}

export function classifyFinalPresentationMedia(submission: string): "pending" | "complete" {
  const youtubeState = classifyYouTubeReference(submission);
  const uploadState = classifyChecklistItem(submission, CHECKLIST.youtubeUpload);
  const verifyState = classifyChecklistItem(submission, CHECKLIST.youtubeVerify);
  if (youtubeState === "pending" && (uploadState === "complete" || verifyState === "complete")) {
    fail("YouTube checklist cannot be complete while the URL is still pending");
  }
  if (youtubeState === "present" && uploadState === "pending" && verifyState === "complete") {
    fail("signed-out YouTube verification cannot precede the upload checklist");
  }

  const completionRequested = youtubeState === "present" && uploadState === "complete" && verifyState === "complete";
  const placeholderEvidence = VIDEO_HASH === PLACEHOLDER_VIDEO_HASH
    || DEVPOST_MANIFEST_HASH === PLACEHOLDER_DEVPOST_MANIFEST_HASH;
  if (completionRequested && placeholderEvidence) {
    fail("final presentation media cannot pass while known placeholder claims, URL, or artifact fingerprints remain");
  }
  return completionRequested && !placeholderEvidence ? "complete" : "pending";
}

export function classifyFinalDevpostSynchronization(submission: string): "pending" | "complete" {
  const synchronizationState = classifyDevpostSynchronization(submission);
  const finalMediaState = classifyFinalPresentationMedia(submission);
  if (synchronizationState === "complete" && finalMediaState !== "complete") {
    fail("Devpost v23 synchronization cannot pass while the final presentation media gate is pending");
  }
  return synchronizationState;
}

export function assertCanonicalTiming(text: string, label: string): void {
  const deadline = "July 21, 2026 at 5:00 PM PDT (Pacific Time)";
  const judgingDeadline = "August 5, 2026 at 5:00 PM PDT (Pacific Time)";
  const deadlineCount = text.split(deadline).length - 1;
  const dateCount = text.split("July 21, 2026").length - 1;
  const judgingDeadlineCount = text.split(judgingDeadline).length - 1;
  const judgingDateCount = text.split("August 5, 2026").length - 1;
  const runtimeCount = text.split("less than 3:00").length - 1;
  if (deadlineCount !== 1 || dateCount !== 1) fail(`${label} must contain exactly one canonical PDT deadline`);
  if (judgingDeadlineCount > 1 || judgingDateCount !== judgingDeadlineCount) fail(`${label} contains a noncanonical judging deadline`);
  if (runtimeCount !== 1) fail(`${label} must contain exactly one canonical less-than-3:00 claim`);
  const timeClaims = text.match(/\b\d{1,2}:\d{2} PM(?: [A-Z]+(?: \(Pacific Time\))?)?/g) ?? [];
  const expectedTimeClaims = Array.from({ length: 1 + judgingDeadlineCount }, () => "5:00 PM PDT (Pacific Time)");
  if (JSON.stringify(timeClaims) !== JSON.stringify(expectedTimeClaims)) {
    fail(`${label} contains noncanonical deadline time claims: ${timeClaims.join(", ") || "none"}`);
  }
  if (/(?:at or below\s*3:00|3:00\s+or\s+(?:under|less)|(?:3|three)\s+minutes?\s+or\s+(?:under|less)|(?:at most|no more than)\s*(?:3:00|(?:3|three)\s+minutes?)|(?:≤|<=)\s*3:00)/i.test(text)) {
    fail(`${label} contains a noncanonical runtime claim`);
  }
}

function requirePhrases(text: string, phrases: readonly string[], label: string): void {
  const missing = phrases.filter((phrase) => !text.includes(phrase));
  if (missing.length) fail(`${label} is missing: ${missing.join(" | ")}`);
}

export function assertJudgingAvailability(handoff: string, releaseOperations: string): void {
  const required = [
    "Judging availability hold",
    "public Sites deployment",
    "managed D1 judging row `18026989-33be-4011-86ee-19e1754cb22c`",
    "managed D1 Pathfinder row `c6adb317-ee2f-4530-9298-e9eb5fe6efd2`",
    "public GitHub repository",
    "public YouTube video",
    "available free and unrestricted through **August 5, 2026 at 5:00 PM PDT (Pacific Time)**",
    "npm run qa:submission:live",
    "pins both current presentation rows and receipts",
    "at least once per day through the judging deadline",
  ] as const;
  requirePhrases(handoff, [...required, EXAMPLE_SCOPE_CLAIM], "final handoff judging hold");
  requirePhrases(releaseOperations, required, "release operations judging hold");
}

function assertExclusiveRuntimeClaims(text: string, label: string): void {
  const servingClaims = [
    ...text.matchAll(/\b[Pp]roduction version (\d+) (?:(?:at|runs) audited runtime commit|runtime) `([0-9a-f]{40})`(?: passes (\d+) tests)?/g),
  ];
  for (const claim of servingClaims) {
    const [, version, commit, tests] = claim;
    if (version !== "23" || commit !== CURRENT_RUNTIME_COMMIT || (tests && tests !== "100")) {
      fail(`${label} contains a competing production-runtime claim: ${claim[0]}`);
    }
  }
  const proofClaims = [
    ...text.matchAll(/\bgenerated by (?:the )?(?:proof-producing )?version (\d+) runtime `([0-9a-f]{40})`/g),
  ];
  for (const claim of proofClaims) {
    const [, version, commit] = claim;
    if (version !== "7" || commit !== PROOF_RUNTIME_COMMIT) {
      fail(`${label} contains a competing proof-runtime claim: ${claim[0]}`);
    }
  }
  if (/\b(?:judging\s+)?(?:proof|recovery)\s+(?:was\s+)?generated by\s+(?:the\s+)?(?:(?:current\s+)?production(?:\s+Sites)?\s+|proof-producing\s+)?version\s+(?!7\b)\d+\b/i.test(text)) {
    fail(`${label} claims a non-proof runtime generated the persisted judging proof`);
  }
  if (/\b(?:current|accepted)\s+(?:(?:production|Sites)\s+){0,2}version\s+(?:14|16|17|18|19|20|21|22)\b/i.test(text)) {
    fail(`${label} contains a stale pre-v23 current-runtime claim`);
  }
}

export function assertSubmissionRuntimeProvenance(submission: string): void {
  requirePhrases(
    submission,
    [
      CURRENT_RUNTIME_CLAIM,
      CURRENT_SITES_RECORD_CLAIM,
      PROOF_RUNTIME_CLAIM,
      HISTORICAL_COMPATIBILITY_CLAIM,
      HISTORICAL_V8_FAIL_CLOSED_CLAIM,
      HISTORICAL_911_FAIL_CLOSED_CLAIM,
      HISTORICAL_V16_RELEASE_CLAIM,
      HISTORICAL_V17_RELEASE_CLAIM,
      HISTORICAL_V18_RELEASE_CLAIM,
      HISTORICAL_V19_RELEASE_CLAIM,
      HISTORICAL_V20_RELEASE_CLAIM,
      REJECTED_V21_CLAIM,
      HISTORICAL_V22_RELEASE_CLAIM,
      IEXILE_RESCUE_CLAIM,
      FRESH_V18_RECOVERY_CLAIM,
      FRESH_V18_MANIFEST_CLAIM,
      FRESH_V18_MODEL_CLAIM,
      HISTORICAL_V16_MATRIX_CLAIM,
      CURRENT_MATRIX_CLAIM,
      EXAMPLE_SCOPE_CLAIM,
      FINAL_MEDIA_CLAIM,
      FINAL_MEDIA_SEAL_CLAIM,
      HISTORICAL_PUBLICATION_CLAIM,
      DEVPOST_MEDIA_STATUS_CLAIM,
      ...PATHFINDER_PROOF_PHRASES,
    ],
    "submission runtime provenance",
  );
  assertExclusiveRuntimeClaims(submission, "submission runtime provenance");
}

export function assertYouTubeRuntimeProvenance(metadata: string): void {
  requirePhrases(metadata, [YOUTUBE_RUNTIME_CLAIM, VIDEO_CAPTURE_FAIL_CLOSED_CLAIM, EXAMPLE_SCOPE_CLAIM, FINAL_MEDIA_CLAIM, FINAL_MEDIA_SEAL_CLAIM, HISTORICAL_PUBLICATION_CLAIM], "YouTube runtime provenance");
  assertExclusiveRuntimeClaims(metadata, "YouTube runtime provenance");
}

export function assertDevpostFieldCopy(fieldCopy: string): { storyLength: number; instructionsLength: number } {
  const story = extractMarkdownSection(fieldCopy, "## About the project", "## Test instructions for judges");
  const instructions = extractMarkdownSection(fieldCopy, "## Test instructions for judges", "## Saved-field reference");
  requirePhrases(story, [
    EXAMPLE_SCOPE_CLAIM,
    "Papyrus Principle",
    "bounded same-site archive records",
    "unwitnessed material remains missing",
    "content-neutral memory infrastructure",
    "100 passing tests",
    CURRENT_RUNTIME_COMMIT,
    PROOF_RUNTIME_CLAIM,
    RECOVERY_URL,
    RECEIPT_URL,
    "planner `gpt-5.6`",
    "model `gpt-5.6-sol`",
    "10 deterministic validations passing",
  ], "Devpost About copy");
  requirePhrases(instructions, [
    PRODUCTION_URL,
    RECOVERY_URL,
    RECEIPT_URL,
    ...PATHFINDER_PROOF_PHRASES.filter((phrase) => phrase !== "12/12 validations"),
    "12 of 12 validations",
    VIDEO_CAPTURE_RECOVERY_URL,
    "historical capture provenance, not either current presentation proof",
    VIDEO_CAPTURE_FAIL_CLOSED_CLAIM,
    "may fail honestly",
    EXAMPLE_SCOPE_CLAIM,
  ], "Devpost judge instructions");
  assertExclusiveRuntimeClaims(story, "Devpost About copy");
  if (/\b36 passing tests\b/i.test(story)) fail("Devpost About copy contains the stale 36-test claim");
  if (story.length > 7_800) fail(`Devpost About copy is ${story.length} characters; expected no more than the internal 7,800-character budget`);
  if (instructions.length > 1_850) fail(`Devpost judge instructions are ${instructions.length} characters; expected no more than the internal 1,850-character budget`);
  return { storyLength: story.length, instructionsLength: instructions.length };
}

interface ReleaseRuntimeDocuments {
  failureMatrix: string;
  readme: string;
  judgeEvidence: string;
  releaseOperations: string;
  submission: string;
  youtubeMetadata: string;
}

export function assertReleaseDocumentRuntimeProvenance(documents: ReleaseRuntimeDocuments): void {
  assertSubmissionRuntimeProvenance(documents.submission);
  assertYouTubeRuntimeProvenance(documents.youtubeMetadata);
  requirePhrases(
    documents.readme,
    [
      CURRENT_RUNTIME_CLAIM,
      CURRENT_SITES_RECORD_CLAIM,
      "Accepted production Sites version 23 serves that persisted receipt 1.0 proof without claiming that v23 generated it.",
      HISTORICAL_V16_RELEASE_CLAIM,
      HISTORICAL_V17_RELEASE_CLAIM,
      HISTORICAL_V18_RELEASE_CLAIM,
      HISTORICAL_V19_RELEASE_CLAIM,
      HISTORICAL_V20_RELEASE_CLAIM,
      REJECTED_V21_CLAIM,
      HISTORICAL_V22_RELEASE_CLAIM,
      HISTORICAL_V8_FAIL_CLOSED_CLAIM,
      IEXILE_RESCUE_CLAIM,
      FRESH_V18_RECOVERY_CLAIM,
      FRESH_V18_MANIFEST_CLAIM,
      CURRENT_MATRIX_CLAIM,
      EXAMPLE_SCOPE_CLAIM,
      ...PATHFINDER_PROOF_PHRASES,
    ],
    "README runtime provenance",
  );
  requirePhrases(
    documents.judgeEvidence,
    [
      `Current accepted release source (operator-recorded), production Sites version 23: [\`${CURRENT_RUNTIME_COMMIT}\`]`,
      `Saved version \`${CURRENT_SITES_VERSION_ID}\`; deployment \`${CURRENT_DEPLOYMENT_ID}\`; environment revision 7; 100 tests.`,
      "Production Sites version 23 serves this persisted version 7 receipt 1.0 proof",
      "split v23-serving/v7-proof provenance plus the v8 historical compatibility probe",
      HISTORICAL_V16_RELEASE_CLAIM,
      HISTORICAL_V17_RELEASE_CLAIM,
      HISTORICAL_V18_RELEASE_CLAIM,
      HISTORICAL_V19_RELEASE_CLAIM,
      HISTORICAL_V20_RELEASE_CLAIM,
      REJECTED_V21_CLAIM,
      HISTORICAL_V22_RELEASE_CLAIM,
      HISTORICAL_V8_FAIL_CLOSED_CLAIM,
      IEXILE_RESCUE_CLAIM,
      FRESH_V18_RECOVERY_CLAIM,
      FRESH_V18_MANIFEST_CLAIM,
      HISTORICAL_V16_MATRIX_CLAIM,
      CURRENT_MATRIX_CLAIM,
      EXAMPLE_SCOPE_CLAIM,
      ...PATHFINDER_PROOF_PHRASES,
    ],
    "judge evidence runtime provenance",
  );
  requirePhrases(
    documents.releaseOperations,
    [
      `Production Sites version 23 was accepted only after the hosted gate passed against the public origin. Its audited source commit is \`${CURRENT_RUNTIME_COMMIT}\`; saved version \`${CURRENT_SITES_VERSION_ID}\`; deployment \`${CURRENT_DEPLOYMENT_ID}\`; environment revision 7.`,
      "Neither record should be relabeled as generated by v23.",
      HISTORICAL_V16_RELEASE_CLAIM,
      HISTORICAL_V17_RELEASE_CLAIM,
      HISTORICAL_V18_RELEASE_CLAIM,
      HISTORICAL_V19_RELEASE_CLAIM,
      HISTORICAL_V20_RELEASE_CLAIM,
      REJECTED_V21_CLAIM,
      HISTORICAL_V22_RELEASE_CLAIM,
      HISTORICAL_V8_FAIL_CLOSED_CLAIM,
      IEXILE_RESCUE_CLAIM,
      FRESH_V18_RECOVERY_CLAIM,
      FRESH_V18_MANIFEST_CLAIM,
      HISTORICAL_V16_MATRIX_CLAIM,
      CURRENT_MATRIX_CLAIM,
    ],
    "release operations runtime provenance",
  );
  requirePhrases(
    documents.failureMatrix,
    [
      HISTORICAL_V16_MATRIX_CLAIM,
      CURRENT_MATRIX_CLAIM,
      IEXILE_RESCUE_CLAIM,
      FRESH_V18_RECOVERY_CLAIM,
      FRESH_V18_MANIFEST_CLAIM,
    ],
    "failure matrix runtime provenance",
  );

  for (const [label, text] of Object.entries(documents)) {
    assertExclusiveRuntimeClaims(text, `${label} runtime provenance`);
    if (/\b(?:current|accepted)[^\r\n]{0,160}\b(?:version\s+(?:14|16|17|18|19|20|21|22)|v(?:14|16|17|18|19|20|21|22))\b/iu.test(text)) {
      fail(`${label} contains a stale pre-v23-as-current claim`);
    }
  }
}

function extractMarkdownSection(text: string, heading: string, nextHeading: string): string {
  const start = text.indexOf(heading);
  const end = text.indexOf(nextHeading, start + heading.length);
  if (start < 0 || end < 0) fail(`cannot resolve ${heading} section`);
  return text.slice(start + heading.length, end).trim();
}

async function addCheck(
  checks: SubmissionCheck[],
  section: SubmissionCheck["section"],
  name: string,
  run: () => Promise<string> | string,
): Promise<void> {
  try {
    const detail = await run();
    checks.push({ section, name, state: "PASS", detail });
  } catch (error) {
    checks.push({
      section,
      name,
      state: "FAIL",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function runSubmissionReadiness(root = DEFAULT_ROOT): Promise<SubmissionCheck[]> {
  const checks: SubmissionCheck[] = [];
  const assetPath = (name: string) => path.join(root, "submission-assets", name);
  const document = (name: string) => readFile(path.join(root, name), "utf8");

  await addCheck(checks, "Media integrity", "Final video master", async () => {
    const [video, sidecar, captureBytes, narrationAuditBytes, compositionBytes] = await Promise.all([
      readRegularFile(assetPath(VIDEO_NAME), { exactBytes: VIDEO_BYTES }),
      readRegularFile(assetPath("alexandria-here-build-week-demo.sha256"), { maxBytes: 1024 }),
      readRegularFile(assetPath("capture-manifest-v23.json"), { maxBytes: 1_000_000 }),
      readRegularFile(assetPath("narration-audit-v23.json"), { maxBytes: 1_000_000 }),
      readRegularFile(assetPath("final-composition-plan-v23.json"), { maxBytes: 1_000_000 }),
    ]);
    const manifest = parseHashManifest(sidecar, [VIDEO_NAME]);
    verifyPinnedHash(video, VIDEO_HASH, "video master");
    if (manifest.get(VIDEO_NAME) !== VIDEO_HASH) fail("video sidecar differs from the pinned master hash");
    const duration = mp4DurationSeconds(video);
    if (Math.abs(duration - VIDEO_DURATION_SECONDS) > 0.01 || duration >= 180) {
      fail(`video duration is ${duration.toFixed(3)} seconds; expected ${VIDEO_DURATION_SECONDS} and less than 180`);
    }
    const provenanceBytes = {
      "capture-manifest-v23.json": captureBytes,
      "narration-audit-v23.json": narrationAuditBytes,
      "final-composition-plan-v23.json": compositionBytes,
    } as const;
    for (const [name, hash] of Object.entries(FINAL_MEDIA_PROVENANCE_HASHES)) {
      verifyPinnedHash(provenanceBytes[name as keyof typeof provenanceBytes], hash, name);
    }

    const composition = JSON.parse(compositionBytes.toString("utf8")) as {
      status?: unknown;
      stage?: unknown;
      output?: unknown;
      inputs?: Array<{ path?: unknown }>;
      ffmpeg?: unknown;
      clock?: { video_frames?: unknown; film_seconds?: unknown };
      captions?: { cue_count?: unknown; last_cue_seconds?: unknown };
      rendered?: {
        path?: unknown;
        bytes?: unknown;
        sha256?: unknown;
        full_decode?: unknown;
        embedded_captions?: { path?: unknown; transcript_parity?: unknown };
      };
    };
    if (composition.status !== "complete" || composition.stage !== "final-media-v23") fail("composition status or portable stage identity drifted");
    if (composition.output !== "alexandria-here-final-demo-v23.mp4") fail("composition output identity drifted");
    if (composition.clock?.video_frames !== VIDEO_FRAMES || composition.clock?.film_seconds !== VIDEO_DURATION_SECONDS) fail("composition clock drifted");
    if (composition.captions?.cue_count !== 56 || composition.captions?.last_cue_seconds !== 149.238) fail("composition caption evidence drifted");
    if (!Array.isArray(composition.inputs) || composition.inputs.length !== 18) fail("composition input inventory drifted");
    const portableNames = [composition.stage, composition.output, composition.ffmpeg, composition.rendered?.path, composition.rendered?.embedded_captions?.path, ...composition.inputs.map((input) => input.path)];
    if (portableNames.some((value) => typeof value !== "string" || /[\\/]/.test(value) || /^[A-Za-z]:/.test(value))) fail("composition provenance exposes a workstation path");
    if (composition.rendered?.bytes !== VIDEO_BYTES || String(composition.rendered?.sha256).toUpperCase() !== VIDEO_HASH || composition.rendered?.full_decode !== "pass") fail("composition master evidence drifted");
    if (composition.rendered?.embedded_captions?.path !== "final-captions-embedded-v23.vtt" || composition.rendered?.embedded_captions?.transcript_parity !== "pass") fail("embedded caption evidence drifted");

    const capture = JSON.parse(captureBytes.toString("utf8")) as { runtime?: { version?: unknown; commit?: unknown }; liveProofs?: Array<{ id?: unknown }> };
    if (capture.runtime?.version !== 23 || capture.runtime?.commit !== CURRENT_RUNTIME_COMMIT) fail("capture runtime provenance drifted");
    if (capture.liveProofs?.[0]?.id !== RECOVERY_ID || capture.liveProofs?.[1]?.id !== PATHFINDER_RECOVERY_ID) fail("capture proof identities drifted");

    const narrationAudit = JSON.parse(narrationAuditBytes.toString("utf8")) as { status?: unknown; disclosure?: unknown; loudness?: { integrated_lufs?: unknown; true_peak_dbtp?: unknown } };
    if (narrationAudit.status !== "PASS" || narrationAudit.disclosure !== "Synthetic narration generated with Microsoft Edge TTS.") fail("narration audit provenance drifted");
    if (narrationAudit.loudness?.integrated_lufs !== -16.01 || narrationAudit.loudness?.true_peak_dbtp !== -1.5) fail("narration loudness evidence drifted");

    return `${VIDEO_HASH}; ${VIDEO_FRAMES} frames at 30 fps; ${duration.toFixed(3)} seconds; exact portable capture, narration, and composition provenance`;
  });

  await addCheck(checks, "Media integrity", "English captions", async () => {
    const [bytes, narration, demoScript] = await Promise.all([
      readRegularFile(assetPath(CAPTIONS_NAME), { maxBytes: 1_000_000 }),
      readFile(assetPath("narration.txt"), "utf8"),
      document("DEMO_SCRIPT.md"),
    ]);
    verifyPinnedHash(bytes, CAPTIONS_HASH, "English captions");
    const cues = validateWebVtt(bytes.toString("utf8"));
    const firstStartMs = cues[0]?.startMs ?? -1;
    const lastEndMs = cues.at(-1)?.endMs ?? -1;
    if (firstStartMs !== 83) fail(`first caption starts at ${firstStartMs} ms; expected 83`);
    if (lastEndMs !== 149_238) fail(`last caption ends at ${lastEndMs} ms; expected 149238`);
    const cueText = cues.map((cue) => cue.text).join(" ");
    const scriptNarration = demoScript
      .split(/\r?\n/)
      .filter((line) => line.startsWith("> "))
      .map((line) => line.slice(2))
      .join(" ");
    requirePhrases(demoScript, [RECOVERY_URL, PATHFINDER_RECOVERY_URL, "synthetic narration only", "no generated historical imagery or evidence"], "demo script capture provenance");
    assertSameWords(cueText, narration, "captions and narration transcript");
    assertSameWords(cueText, scriptNarration, "captions and demo script narration");
    return `${cues.length} exact cues from ${firstStartMs} to ${lastEndMs} ms; transcript and script match`;
  });

  await addCheck(checks, "Media integrity", "Final YouTube thumbnail", async () => {
    const bytes = await readRegularFile(assetPath(YOUTUBE_THUMBNAIL_NAME), { exactBytes: YOUTUBE_THUMBNAIL_BYTES });
    verifyPinnedHash(bytes, YOUTUBE_THUMBNAIL_HASH, "YouTube thumbnail");
    validatePng(bytes, 1280, 720);
    return `${YOUTUBE_THUMBNAIL_NAME}; 1280x720 RGB PNG; ${bytes.length} bytes`;
  });

  await addCheck(checks, "Media integrity", "Final Devpost media set", async () => {
    const manifestBytes = await readRegularFile(assetPath("devpost-media.sha256"), { maxBytes: 10_000 });
    verifyPinnedHash(manifestBytes, DEVPOST_MANIFEST_HASH, "Devpost manifest");
    const manifest = parseHashManifest(manifestBytes, DEVPOST_NAMES);
    const assetNames = await readdir(path.join(root, "submission-assets"));
    const devpostCandidates = assetNames
      .filter((name) => /devpost/i.test(name) && /\.(?:png|jpe?g|gif)$/i.test(name))
      .sort();
    const youtubeCandidates = assetNames
      .filter((name) => /youtube-thumbnail/i.test(name) && /\.(?:png|jpe?g|gif)$/i.test(name))
      .sort();
    validateCandidateNames(devpostCandidates, [...DEVPOST_NAMES].sort(), "Devpost upload");
    validateCandidateNames(youtubeCandidates, [YOUTUBE_THUMBNAIL_NAME], "YouTube thumbnail upload");
    for (const name of DEVPOST_NAMES) {
      const bytes = await readRegularFile(assetPath(name), { maxBytes: DEVPOST_MAX_BYTES });
      if (manifest.get(name) !== DEVPOST_HASHES[name]) {
        fail(`${name} differs from its pinned role hash`);
      }
      verifyPinnedHash(bytes, DEVPOST_HASHES[name], name);
      validatePng(bytes, 1500, 1000);
    }
    return `${DEVPOST_NAMES.length} exact 1500x1000 RGB PNGs; cover plus ${GALLERY_NAMES.length} ordered gallery cards`;
  });

  await addCheck(checks, "Submission contracts", "Final YouTube copy package", async () => {
    const metadata = await document("YOUTUBE_METADATA.md");
    assertYouTubeRuntimeProvenance(metadata);
    const title = extractMarkdownSection(metadata, "## Title", "## Description").trim();
    const description = extractMarkdownSection(metadata, "## Description", "## Recommended upload settings");
    if (title !== YOUTUBE_TITLE) fail(`YouTube title differs from the sealed ${YOUTUBE_TITLE.length}-character title`);
    if (!description || description.length > 5000) fail(`YouTube description length is ${description.length}; expected 1-5000 characters`);
    requirePhrases(description, [PRODUCTION_URL, RECOVERY_URL, RECEIPT_URL, PATHFINDER_RECOVERY_URL, PATHFINDER_RECEIPT_URL, REPOSITORY_URL, "Codex", "GPT-5.6", "synthetic narration", "no generated historical imagery or evidence", "claims neither ownership nor historical completeness", "Papyrus Principle", "bounded same-site archive records", "unwitnessed material remains missing", EXAMPLE_SCOPE_CLAIM], "YouTube description");
    const chapters = [...description.matchAll(/^(\d{2}):(\d{2}) (.+)$/gm)].map((match) => Number(match[1]) * 60 + Number(match[2]));
    if (JSON.stringify(chapters) !== JSON.stringify(YOUTUBE_CHAPTERS)) {
      fail(`YouTube chapter boundaries are ${chapters.join(", ")}; expected ${YOUTUBE_CHAPTERS.join(", ")}`);
    }
    requirePhrases(metadata, ["Visibility: Public", "Allow embedding: On", YOUTUBE_THUMBNAIL_NAME, CAPTIONS_NAME], "YouTube upload settings");
    return `${title.length}-character title; ${description.length}-character description; ${chapters.length} valid chapters`;
  });

  await addCheck(checks, "Submission contracts", "Devpost handoff", async () => {
    const handoff = await document("FINAL_SUBMISSION_HANDOFF.md");
    const releaseOperations = await document("RELEASE_OPERATIONS.md");
    requirePhrases(handoff, [VIDEO_NAME, VIDEO_HASH, YOUTUBE_THUMBNAIL_NAME, CAPTIONS_NAME, DEVPOST_NAMES[0], "devpost-media.sha256", "DEVPOST_FIELD_COPY.md", "Authenticated synchronization on July 19, 2026", "Devpost Preview was then verified", "99 passing tests", RECOVERY_ID, "4/5 steps done", "project thumbnail is the exact audited `08-devpost-cover.png`", "image gallery contains exactly six audited cards in numbered order", "gallery tabs `1 of 6` through `6 of 6`", `video-demo field contains ${HISTORICAL_YOUTUBE_URL}`, "official-rules checkbox is unchecked", "less than 3:00", "2:31.04", "July 21, 2026 at 5:00 PM PDT (Pacific Time)", "https://openai.devpost.com/rules", "https://openai.devpost.com/details/faqs", PRODUCTION_URL, REPOSITORY_URL, RECOVERY_URL, RECEIPT_URL, PATHFINDER_RECOVERY_URL, PATHFINDER_RECEIPT_URL, VIDEO_CAPTURE_RECOVERY_URL, VIDEO_CAPTURE_FAIL_CLOSED_CLAIM, HISTORICAL_YOUTUBE_URL, FINAL_YOUTUBE_REFERENCE, SESSION_ID, "up to 15 images", "5 MB", "Jaia's authority", "phone verification", "official-rules acceptance", "final submission", EXAMPLE_SCOPE_CLAIM, FINAL_MEDIA_CLAIM, FINAL_MEDIA_SEAL_CLAIM, HISTORICAL_PUBLICATION_CLAIM, "Public media synchronization remains pending"], "final handoff");
    assertJudgingAvailability(handoff, releaseOperations);
    assertCanonicalTiming(handoff, "final handoff");
    const galleryLine = handoff.split(/\r?\n/).find((line) => line.startsWith("- Gallery, in upload order:"));
    if (!galleryLine) fail("final handoff is missing the exact gallery upload-order line");
    const handoffGallery = [...galleryLine.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
    validateCandidateNames(handoffGallery, GALLERY_NAMES, "Devpost handoff gallery");
    const requirements = extractMarkdownSection(handoff, "Build Week requirements", "Recommended YouTube and accessibility settings");
    if (/embedding/i.test(requirements)) fail("embedding is incorrectly labeled as an official requirement");
    const recommended = extractMarkdownSection(handoff, "Recommended YouTube and accessibility settings", "Publication verification passed");
    if (!/Allow embedding: \*\*On\*\*/.test(recommended)) fail("embedding recommendation is missing");
    return `exact media paths, official/recommended split, gallery order, authority boundary, submission deadline, and judging hold`;
  });

  await addCheck(checks, "Submission contracts", "Devpost field copy", async () => {
    const fieldCopy = await document("DEVPOST_FIELD_COPY.md");
    const lengths = assertDevpostFieldCopy(fieldCopy);
    return `${lengths.storyLength}-character About copy; ${lengths.instructionsLength}-character judge instructions; current proof and general scope locked`;
  });

  await addCheck(checks, "Submission contracts", "Evidence-backed submission narrative", async () => {
    const [submission, readme, judgeEvidence, releaseOperations, youtubeMetadata, failureMatrix] = await Promise.all([
      document("SUBMISSION.md"),
      document("README.md"),
      document("JUDGE_EVIDENCE.md"),
      document("RELEASE_OPERATIONS.md"),
      document("YOUTUBE_METADATA.md"),
      document("FAILURE_RELIABILITY_MATRIX.md"),
    ]);
    assertReleaseDocumentRuntimeProvenance({ failureMatrix, readme, judgeEvidence, releaseOperations, submission, youtubeMetadata });
    requirePhrases(submission, [PRODUCTION_URL, REPOSITORY_URL, RECOVERY_URL, RECEIPT_URL, ...PATHFINDER_PROOF_PHRASES, VIDEO_CAPTURE_RECOVERY_URL, VIDEO_CAPTURE_FAIL_CLOSED_CLAIM, HISTORICAL_V8_FAIL_CLOSED_CLAIM, HISTORICAL_911_ID, HISTORICAL_911_FAIL_CLOSED_CLAIM, HISTORICAL_YOUTUBE_URL, FINAL_YOUTUBE_REFERENCE, SESSION_ID, "5 returned preserved pages plus 2 witnessed Missing states from 8 capture records", "347 rendered blocks", "946 content-addressed extracted evidence blocks", "36 inferred edges", "8 known absences", "10 of 10 deterministic", "planner: \"gpt-5.6\"", "model `gpt-5.6-sol`", "deterministic `era_selection`", "GPT-5.6 `page_order` and `primary_witness` decisions", "fourteen static/local release-contract checks", "eight-boundary compiled failure matrix", "bare, query-bearing, and archived `.onion` HTTP(S) locators", "query-cleared sibling path across HTTP and HTTPS variants", "8 manifest pages: 6 returned and 2 represented honestly as missing", "154 preserved evidence blocks", "24 witnessed internal-reference edges", "July 21, 2026 at 5:00 PM PDT (Pacific Time)", "Papyrus Principle", "bounded same-site archive records", "unwitnessed material remains missing"], "submission narrative");
    assertCanonicalTiming(submission, "submission narrative");
    const youtubeState = classifyYouTubeReference(submission);
    return `v23 release documents, dual-example proof, receipt, model, metric, Session ID, deadline, and ${youtubeState === "pending" ? "final-URL pending marker" : "final public YouTube URL"} claims are present`;
  });

  await addCheck(checks, "Submission contracts", "Portable checkout and command contract", async () => {
    const [attributes, packageJson] = await Promise.all([
      document(".gitattributes"),
      document("package.json").then((raw) => JSON.parse(raw) as { scripts?: Record<string, string> }),
    ]);
    requirePhrases(attributes, ["*.png binary", "*.mp4 binary", "*.vtt text eol=lf", "*.sha256 text eol=lf", "submission-assets/*.json text eol=lf", "submission-assets/narration.txt text eol=lf"], ".gitattributes");
    if (packageJson.scripts?.["qa:submission"] !== "tsx scripts/submission-readiness.ts") {
      fail("package.json does not expose the exact non-mutating submission preflight");
    }
    if (packageJson.scripts?.["qa:media"] !== "tsx scripts/audit-final-media-v23.ts") {
      fail("package.json does not expose the exact non-mutating final-media audit");
    }
    return `binary media and LF text seals survive fresh checkouts; qa:media and qa:submission are declared`;
  });

  let submissionText = "";
  try {
    submissionText = await document("SUBMISSION.md");
  } catch (error) {
    checks.push({ section: "External authority", name: "Submission execution", state: "FAIL", detail: error instanceof Error ? error.message : String(error) });
    return checks;
  }

  try {
    const mediaState = classifyFinalPresentationMedia(submissionText);
    checks.push({
      section: "External authority",
      name: "Final presentation media replacement",
      state: mediaState === "pending" ? "PENDING" : "PASS",
      detail: mediaState === "pending"
        ? "the final local artifacts are sealed; publish and signed-out verify the new video, captions, and thumbnail before replacing the Devpost embed"
        : "the final non-placeholder URL, artifact fingerprints, public metadata, captions, and embed checks are explicitly recorded",
    });
  } catch (error) {
    checks.push({ section: "External authority", name: "Final presentation media replacement", state: "FAIL", detail: error instanceof Error ? error.message : String(error) });
  }

  try {
    const textState = classifyChecklistItem(submissionText, CHECKLIST.devpostText);
    const mediaState = classifyChecklistItem(submissionText, CHECKLIST.devpostMedia);
    const synchronizationState = classifyFinalDevpostSynchronization(submissionText);
    checks.push({
      section: "External authority",
      name: "Devpost v23 synchronization",
      state: synchronizationState === "pending" ? "PENDING" : "PASS",
      detail: synchronizationState === "pending"
        ? textState === "complete" && mediaState === "pending"
          ? "the historical text save is recorded; upload the final v23 thumbnail/gallery and verify Preview"
          : "save and Preview-verify the v23 text fields, then upload the final thumbnail/gallery and replace the video embed"
        : "submission checklist explicitly records the final v23 text, media, video, and Preview checks",
    });
  } catch (error) {
    checks.push({ section: "External authority", name: "Devpost v23 synchronization", state: "FAIL", detail: error instanceof Error ? error.message : String(error) });
  }

  try {
    const rulesState = classifyChecklistItem(submissionText, CHECKLIST.rules);
    const submitState = classifyChecklistItem(submissionText, CHECKLIST.submit);
    if (rulesState === "pending" && submitState === "complete") fail("final submit cannot precede personal rules acceptance");
    const pending = rulesState === "pending" || submitState === "pending";
    checks.push({
      section: "External authority",
      name: "Rules acceptance and final submit",
      state: pending ? "PENDING" : "PASS",
      detail: pending ? "Jaia must personally accept the rules and submit before the recorded deadline" : "submission checklist explicitly records both personal actions",
    });
  } catch (error) {
    checks.push({ section: "External authority", name: "Rules acceptance and final submit", state: "FAIL", detail: error instanceof Error ? error.message : String(error) });
  }

  return checks;
}

export function printSubmissionReadiness(checks: SubmissionCheck[]): void {
  for (const section of ["Media integrity", "Submission contracts", "External authority"] as const) {
    console.log(`\n${section}`);
    for (const item of checks.filter((entry) => entry.section === section)) {
      console.log(`${item.state.padEnd(7)} ${item.name} — ${item.detail}`);
    }
  }
  const failures = checks.filter((item) => item.state === "FAIL");
  const pending = checks.filter((item) => item.state === "PENDING");
  console.log(`\nResult: ${failures.length ? `${failures.length} enforced submission gate(s) failed; external PENDING items do not mask local failures.` : `all enforced local submission gates passed; ${pending.length} external action(s) remain PENDING.`}`);
}

function printUploadSelections(root: string): void {
  const asset = (name: string) => path.resolve(root, "submission-assets", name);
  const line = (label: string, name: string) => console.log(`${label.padEnd(20)}${asset(name)}`);
  console.log("\nFinal artifact paths (upload only after every local media gate passes)");
  line("YouTube video", VIDEO_NAME);
  line("YouTube thumbnail", YOUTUBE_THUMBNAIL_NAME);
  line("YouTube captions", CAPTIONS_NAME);
  line("Devpost thumbnail", DEVPOST_NAMES[0]);
  GALLERY_NAMES.forEach((name, index) => line(`Gallery ${String(index + 1).padStart(2, "0")}`, name));
}

export function submissionExitCode(checks: SubmissionCheck[], finalMode = false): 0 | 1 {
  return checks.some((item) => item.state === "FAIL" || (finalMode && item.state === "PENDING")) ? 1 : 0;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  const checks = await runSubmissionReadiness();
  const finalMode = process.argv.includes("--final");
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(checks, null, 2));
  } else {
    printSubmissionReadiness(checks);
    if (!checks.some((item) => item.state === "FAIL")) printUploadSelections(DEFAULT_ROOT);
    if (finalMode && checks.some((item) => item.state === "PENDING")) {
      console.log("\nFinal mode: PENDING external actions prevent final handoff.");
    }
  }
  process.exitCode = submissionExitCode(checks, finalMode);
}
