import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { RecoveryForm } from "../app/recovery-form";
import {
  isPathContained,
  normalizePreviewArguments,
  previewEnvironment,
  rebaseWranglerConfig,
} from "../scripts/compiled-preview-contract.mjs";
import {
  createFreshPreviewConfigDirectory,
  ensureContainedDirectory,
  writeExclusivePreviewConfig,
} from "../scripts/compiled-preview-files.mjs";
import { forbiddenArtifactReason, isForbiddenArtifactPath } from "../scripts/release-artifact-contract.mjs";
import {
  assertExactPathfinderProof,
  assertExactReferenceProof,
  EXACT_PATHFINDER_PROOF,
  EXACT_REFERENCE_PROOF,
} from "../scripts/submission-proof-contract.mjs";
import {
  FONT_ASSET_PATHS,
  FONT_CACHE_CONTROL,
  FONT_PUBLIC_PATHS,
  FONT_WORKER_ROUTE_MARKER,
} from "../lib/font-delivery";

import {
  assertCanonicalTiming,
  assertJudgingAvailability,
  assertDevpostFieldCopy,
  assertReleaseDocumentRuntimeProvenance,
  assertSubmissionRuntimeProvenance,
  assertYouTubeRuntimeProvenance,
  classifyChecklistItem,
  classifyDevpostSynchronization,
  classifyFinalDevpostSynchronization,
  classifyFinalPresentationMedia,
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
const unsafeFontReference = /(?:(?:file:|[A-Za-z]:[\\/]|\\\\(?:\?\\UNC\\|[^\\/\s"'`<>]+[\\/]))[^"'`<>\r\n)]{0,32767})\.(?:woff2?|ttf|otf)\b/iu;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cssRule(css: string, selector: string, property?: string): string {
  const matches = [...css.matchAll(new RegExp(`(?:^|(?<=[{}]))\\s*${escapeRegExp(selector)}\\s*\\{([^{}]*)\\}`, "g"))]
    .map((match) => match[1])
    .filter((rule) => !property || new RegExp(`(?:^|;)\\s*${escapeRegExp(property)}\\s*:`, "i").test(rule));
  assert.equal(matches.length, 1, `${selector} must resolve to exactly one flat CSS rule${property ? ` declaring ${property}` : ""}`);
  return matches[0];
}

function cssDeclaration(rule: string, property: string): string {
  const matches = [...rule.matchAll(new RegExp(`(?:^|;)\\s*${escapeRegExp(property)}\\s*:\\s*([^;]+)`, "gi"))];
  assert.equal(matches.length, 1, `${property} must resolve to exactly one declaration`);
  return matches[0][1].trim();
}

function resolveCssColor(css: string, value: string): string {
  const variable = value.match(/^var\((--[a-z0-9-]+)\)$/i)?.[1];
  return variable ? cssDeclaration(cssRule(css, ":root", variable), variable) : value;
}

function relativeLuminance(hex: string): number {
  assert.match(hex, /^#[0-9a-f]{6}$/i, `expected an exact six-digit CSS color, received ${hex}`);
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
    / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
}

test("the final local submission package passes while external publication remains fail-closed", async () => {
  const checks = await runSubmissionReadiness(root);
  assert.deepEqual(checks.filter((check) => check.state === "FAIL"), []);
  assert.deepEqual(
    checks.filter((check) => check.state === "PENDING").map((check) => check.name),
    ["Final presentation media replacement", "Devpost v23 synchronization", "Rules acceptance and final submit"],
  );
  assert.equal(
    checks.find((check) => check.name === "Final presentation media replacement")?.detail,
    "the final local artifacts are sealed; publish and signed-out verify the new video, captions, and thumbnail before replacing the Devpost embed",
  );
  assert.equal(submissionExitCode(checks), 0);
  assert.equal(submissionExitCode(checks, true), 1);
  const submission = await readFile(path.join(root, "SUBMISSION.md"), "utf8");
  assert.doesNotThrow(() => assertSubmissionRuntimeProvenance(submission));
  assert.throws(
    () => assertSubmissionRuntimeProvenance(submission.replace(
      "Status: final version 23 media is locally audited; public YouTube replacement, Devpost synchronization, rules acceptance, and final submission remain pending.",
      "Status: final submission remains pending.",
    )),
    /submission runtime provenance/,
  );
  assert.throws(
    () => assertSubmissionRuntimeProvenance(submission.replace("Production version 23 at audited runtime commit", "Production version 18 at audited runtime commit")),
    /submission runtime provenance/,
  );
  assert.throws(
    () => assertSubmissionRuntimeProvenance(submission.replace("proof-producing version 7 runtime", "proof-producing version 23 runtime")),
    /submission runtime provenance/,
  );
  assert.throws(
    () => assertSubmissionRuntimeProvenance(`${submission}\nProduction version 7 at audited runtime commit \`042215042dd46ded14b501f961f4d9e7debb8178\` passes 48 tests.`),
    /competing production-runtime claim/,
  );
  assert.throws(
    () => assertSubmissionRuntimeProvenance(submission.replace("appgdep_6a5d57fbccb08191b868daeaf3d8e0d8", "appgdep_00000000000000000000000000000000")),
    /submission runtime provenance/,
  );
  assert.throws(
    () => assertSubmissionRuntimeProvenance(submission.replace("6e467987-af60-4153-8d27-7653f56475aa", "00000000-0000-4000-8000-000000000000")),
    /submission runtime provenance/,
  );
  assert.throws(
    () => assertSubmissionRuntimeProvenance(submission.replace("52a87f55-914f-4f17-a2b3-40021351f442", "00000000-0000-4000-8000-000000000000")),
    /submission runtime provenance/,
  );
  assert.throws(
    () => assertSubmissionRuntimeProvenance(submission.replace("ec9ab849-611a-4644-86d9-2ef82de1c61e", "00000000-0000-4000-8000-000000000000")),
    /submission runtime provenance/,
  );
  assert.throws(
    () => assertSubmissionRuntimeProvenance(submission.replace("c615fc3375be9a0d7c10e8fd3753fc9f29701d54f7901ccfd5db94a867f4ec3c", "0".repeat(64))),
    /submission runtime provenance/,
  );
  assert.throws(
    () => assertSubmissionRuntimeProvenance(submission.replace("appgdep_6a5ca4a4cc788191924a28d69120d106", "appgdep_00000000000000000000000000000000")),
    /submission runtime provenance/,
  );
  assert.throws(
    () => assertSubmissionRuntimeProvenance(submission.replace("Historical Sites release v18 used runtime commit", "Historical Sites release v15 used runtime commit")),
    /submission runtime provenance/,
  );
  assert.throws(
    () => assertSubmissionRuntimeProvenance(submission.replace(
      "Production version 23 passed the full eight-boundary compiled failure matrix.",
      "Production version 23 did not pass the full eight-boundary compiled failure matrix.",
    )),
    /submission runtime provenance/,
  );
  assert.throws(
    () => assertSubmissionRuntimeProvenance(submission.replace(
      "The exact final version 16 failure-matrix rerun was externally blocked because public Wayback CDX returned zero bytes or timed out; no timeout was relaxed.",
      "The exact final version 16 failure-matrix rerun passed.",
    )),
    /submission runtime provenance/,
  );
  assert.throws(
    () => assertSubmissionRuntimeProvenance(submission.replace(
      "iExile is one witnessed production proof, not Alexandria's product boundary. Alexandria's product is the lost public web wherever surviving witnesses exist.",
      "iExile defines Alexandria's product boundary.",
    )),
    /submission runtime provenance/,
  );
  assert.throws(
    () => assertSubmissionRuntimeProvenance(submission.replace(
      "The historical version-8 probe now fails closed under the current evidence-replay validator; its machine receipt is unavailable.",
      "The historical version-8 probe remains current clickable proof.",
    )),
    /submission runtime provenance/,
  );
  assert.throws(
    () => assertSubmissionRuntimeProvenance(submission.replace(
      "The historical 9/11 Commission row now fails closed under the current evidence-replay validator; its machine receipt is unavailable.",
      "The historical 9/11 Commission row remains current clickable proof.",
    )),
    /submission runtime provenance/,
  );
  const youtubeMetadata = await readFile(path.join(root, "YOUTUBE_METADATA.md"), "utf8");
  assert.doesNotThrow(() => assertYouTubeRuntimeProvenance(youtubeMetadata));
  assert.throws(
    () => assertYouTubeRuntimeProvenance(youtubeMetadata.replace("generated by version 7 runtime", "generated by version 23 runtime")),
    /YouTube runtime provenance/,
  );
  assert.throws(
    () => assertYouTubeRuntimeProvenance(youtubeMetadata.replace("65b39285520cf871df1081d6899b083af3edbd83", "042215042dd46ded14b501f961f4d9e7debb8178")),
    /YouTube runtime provenance/,
  );
  assert.throws(
    () => assertYouTubeRuntimeProvenance(youtubeMetadata.replace("The historical video-capture row now fails closed under the current evidence-replay validator; its machine receipt is unavailable.", "The historical video-capture row remains a current proof.")),
    /YouTube runtime provenance/,
  );
  assert.throws(
    () => assertYouTubeRuntimeProvenance(`${youtubeMetadata}\nThe proof was generated by version 23 runtime \`65b39285520cf871df1081d6899b083af3edbd83\`.`),
    /competing proof-runtime claim|non-proof runtime/,
  );
  assert.throws(
    () => assertYouTubeRuntimeProvenance(youtubeMetadata.replace(
      "iExile is one witnessed production proof, not Alexandria's product boundary. Alexandria's product is the lost public web wherever surviving witnesses exist.",
      "iExile defines Alexandria's product boundary.",
    )),
    /YouTube runtime provenance/,
  );
  const readme = await readFile(path.join(root, "README.md"), "utf8");
  const judgeEvidence = await readFile(path.join(root, "JUDGE_EVIDENCE.md"), "utf8");
  const releaseOperations = await readFile(path.join(root, "RELEASE_OPERATIONS.md"), "utf8");
  const failureMatrix = await readFile(path.join(root, "FAILURE_RELIABILITY_MATRIX.md"), "utf8");
  const releaseDocuments = { failureMatrix, readme, judgeEvidence, releaseOperations, submission, youtubeMetadata };
  assert.doesNotThrow(() => assertReleaseDocumentRuntimeProvenance(releaseDocuments));
  assert.throws(
    () => assertReleaseDocumentRuntimeProvenance({
      ...releaseDocuments,
      readme: `${readme}\nCurrent production Sites version 18 serves the judging surface.`,
    }),
    /stale pre-v23 current-runtime claim/,
  );
  assert.throws(
    () => assertReleaseDocumentRuntimeProvenance({
      ...releaseDocuments,
      readme: `${readme}\nCurrent production version 20 serves the judging surface.`,
    }),
    /stale pre-v23 current-runtime claim/,
  );
  for (const key of ["readme", "judgeEvidence", "submission"] as const) {
    const pathfinderDriftDocuments = {
      ...releaseDocuments,
      [key]: releaseDocuments[key].replace("03f1c3db3e60688b95faf3b25589cb6610b2697369f9c7ee39fc41ec9a6215ab", "03f1c3db3e60688b95faf3b25589cb6610b2697369f9c7ee39fc41ec9a6215aa"),
    };
    assert.throws(
      () => assertReleaseDocumentRuntimeProvenance(pathfinderDriftDocuments),
      /runtime provenance|submission narrative/,
      `${key} must pin the Pathfinder manifest hash`,
    );
  }
  assert.throws(
    () => assertReleaseDocumentRuntimeProvenance({
      ...releaseDocuments,
      judgeEvidence: judgeEvidence.replace(
        "The historical version-8 probe now fails closed under the current evidence-replay validator; its machine receipt is unavailable.",
        "The historical version-8 probe remains current clickable proof.",
      ),
    }),
    /judge evidence runtime provenance/,
  );
  for (const key of ["readme", "judgeEvidence", "youtubeMetadata"] as const) {
    const scopeDriftDocuments = {
      ...releaseDocuments,
      [key]: releaseDocuments[key].replace(
        "iExile is one witnessed production proof, not Alexandria's product boundary. Alexandria's product is the lost public web wherever surviving witnesses exist.",
        "iExile defines Alexandria's product boundary.",
      ),
    };
    assert.throws(
      () => assertReleaseDocumentRuntimeProvenance(scopeDriftDocuments),
      /runtime provenance/,
      `${key} must reject a single-example product boundary`,
    );
  }
  for (const key of Object.keys(releaseDocuments) as Array<keyof typeof releaseDocuments>) {
    const staleDocuments = {
      ...releaseDocuments,
      [key]: releaseDocuments[key].replace(
        "65b39285520cf871df1081d6899b083af3edbd83",
        "0000000000000000000000000000000000000000",
      ),
    };
    assert.notEqual(staleDocuments[key], releaseDocuments[key], `${key} must contain the pinned current runtime commit`);
    assert.throws(
      () => assertReleaseDocumentRuntimeProvenance(staleDocuments),
      /runtime provenance|competing production-runtime claim/,
      `${key} must reject an unpinned current runtime commit`,
    );
  }
  const finalHandoff = await readFile(path.join(root, "FINAL_SUBMISSION_HANDOFF.md"), "utf8");
  assert.doesNotThrow(() => assertJudgingAvailability(finalHandoff, releaseOperations));
  const scopeDriftHandoff = finalHandoff.replace(
    "iExile is one witnessed production proof, not Alexandria's product boundary. Alexandria's product is the lost public web wherever surviving witnesses exist.",
    "iExile defines Alexandria's product boundary.",
  );
  assert.notEqual(scopeDriftHandoff, finalHandoff);
  assert.throws(
    () => assertJudgingAvailability(scopeDriftHandoff, releaseOperations),
    /final handoff judging hold|final handoff/,
  );
  assert.throws(
    () => assertJudgingAvailability(finalHandoff.replace("available free and unrestricted through", "available through"), releaseOperations),
    /final handoff judging hold is missing/,
  );
  assert.throws(
    () => assertJudgingAvailability(finalHandoff, releaseOperations.replace("at least once per day through the judging deadline", "periodically")),
    /release operations judging hold is missing/,
  );
  const devpostFieldCopy = await readFile(path.join(root, "DEVPOST_FIELD_COPY.md"), "utf8");
  assert.doesNotThrow(() => assertDevpostFieldCopy(devpostFieldCopy));
  assert.throws(
    () => assertDevpostFieldCopy(devpostFieldCopy.replace("100 passing tests", "36 passing tests")),
    /Devpost About copy/,
  );
  assert.throws(
    () => assertDevpostFieldCopy(devpostFieldCopy.replace(
      "042215042dd46ded14b501f961f4d9e7debb8178",
      "65b39285520cf871df1081d6899b083af3edbd83",
    )),
    /Devpost About copy/,
  );
  assert.throws(
    () => assertDevpostFieldCopy(devpostFieldCopy.replace(
      "## Test instructions for judges",
      "The judging proof was generated by production version 23.\n\n## Test instructions for judges",
    )),
    /non-proof runtime generated the persisted judging proof/,
  );
  assert.throws(
    () => assertDevpostFieldCopy(devpostFieldCopy.replace(
      "## Test instructions for judges",
      "The judging recovery was generated by production Sites version 23.\n\n## Test instructions for judges",
    )),
    /non-proof runtime generated the persisted judging proof/,
  );
  assert.throws(
    () => assertDevpostFieldCopy(devpostFieldCopy.replaceAll(
      "18026989-33be-4011-86ee-19e1754cb22c",
      "8ea53a47-437b-4afe-ad2c-29c81637a327",
    )),
    /Devpost About copy|Devpost judge instructions/,
  );
  assert.throws(
    () => assertDevpostFieldCopy(devpostFieldCopy.replace("The historical video-capture row now fails closed under the current evidence-replay validator; its machine receipt is unavailable.", "The historical video-capture row remains a current proof.")),
    /Devpost judge instructions/,
  );
  assert.throws(
    () => assertDevpostFieldCopy(devpostFieldCopy.replace("03f1c3db3e60688b95faf3b25589cb6610b2697369f9c7ee39fc41ec9a6215ab", "0".repeat(64))),
    /Devpost judge instructions/,
  );
  for (const phrase of [
    "public Sites deployment",
    "managed D1 judging row `18026989-33be-4011-86ee-19e1754cb22c`",
    "managed D1 Pathfinder row `c6adb317-ee2f-4530-9298-e9eb5fe6efd2`",
    "public GitHub repository",
    "public YouTube video",
    "npm run qa:submission:live",
    "pins both current presentation rows and receipts",
  ]) {
    assert.throws(
      () => assertJudgingAvailability(finalHandoff.replaceAll(phrase, "removed hold surface"), releaseOperations),
      /final handoff judging hold is missing/,
      `final handoff must pin ${phrase}`,
    );
    assert.throws(
      () => assertJudgingAvailability(finalHandoff, releaseOperations.replaceAll(phrase, "removed hold surface")),
      /release operations judging hold is missing/,
      `release operations must pin ${phrase}`,
    );
  }

  const layout = await readFile(path.join(root, "app", "layout.tsx"), "utf8");
  const css = await readFile(path.join(root, "app", "globals.css"), "utf8");
  const homeSource = await readFile(path.join(root, "app", "page.tsx"), "utf8");
  const restoredSiteSource = await readFile(path.join(root, "app", "r", "[id]", "[[...path]]", "restored-site.tsx"), "utf8");
  const staticHeaders = await readFile(path.join(root, "public", "_headers"), "utf8");
  const viteSource = await readFile(path.join(root, "vite.config.ts"), "utf8");
  const workerSource = await readFile(path.join(root, "worker", "index.ts"), "utf8");
  const fontDeliverySource = await readFile(path.join(root, "lib", "font-delivery.ts"), "utf8");
  const releaseReadiness = await readFile(path.join(root, "scripts", "release-readiness.mjs"), "utf8");
  const localDevLauncher = await readFile(path.join(root, "scripts", "start-local-dev.mjs"), "utf8");
  const submissionLiveProofWrapper = await readFile(path.join(root, "scripts", "submission-live-proof.mjs"), "utf8");
  const packageContract = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  assert.match("file:///C:/build/font.woff2", unsafeFontReference);
  assert.match("C:/build/font.woff2", unsafeFontReference);
  assert.match("C:\\build\\font.woff2", unsafeFontReference);
  assert.match(String.raw`\\server\share\font.woff2`, unsafeFontReference);
  assert.match(String.raw`\\?\UNC\server\share\font.woff2`, unsafeFontReference);
  assert.match(`C:/${"nested/".repeat(200)}font.woff2`, unsafeFontReference);
  assert.doesNotMatch("/fonts/font.woff2", unsafeFontReference);
  assert.throws(
    () => cssRule(".mobile.original-address { color: #ffffff; }", ".original-address", "color"),
    /exactly one flat CSS rule/u,
  );
  assert.throws(
    () => cssRule(".original-address{color:#ffffff}.original-address{color:#000000}", ".original-address", "color"),
    /exactly one flat CSS rule/u,
  );
  assert.doesNotMatch(layout, /from\s+["']next\/font(?:\/google|\/local)?["']/u);
  assert.doesNotMatch(homeSource, /When the page is gone, its neighbors become witnesses\./u);
  assert.doesNotMatch(homeSource, /className="landing-aside"/u);
  assert.match(homeSource, /returns only what surviving public evidence can support/u);
  assert.match(homeSource, /does not decide which history deserves recovery\. Preservation is not endorsement\./u);
  assert.doesNotMatch(homeSource, /knowledge thought lost when the Library of Alexandria burned/u);
  assert.ok(
    homeSource.indexOf("<RecoveryForm />") < homeSource.indexOf('id="evidence-contract-title"'),
    "the recovery invocation must precede the evidence contract",
  );
  assert.match(css, /\.landing-hero h1\s*\{[^{}]*clamp\(45px,\s*5\.1vw,\s*72px\)\/1\.02/u);
  assert.match(css, /\.returned-masthead h1\s*\{[^{}]*font-size:\s*clamp\(42px,\s*5\.5vw,\s*78px\)[^{}]*overflow-wrap:\s*anywhere/u);
  assert.match(css, /\.evidence-intro h2\s*\{[^{}]*clamp\(34px,\s*3\.7vw,\s*52px\)/u);
  assert.match(css, /\.section-intro h2\s*\{[^{}]*clamp\(36px,\s*4vw,\s*60px\)/u);
  assert.match(css, /@media \(max-width:\s*560px\)[\s\S]*?\.landing-hero h1\s*\{[^{}]*font-size:\s*36px[^{}]*\}[\s\S]*?\.returned-masthead h1\s*\{[^{}]*clamp\(36px,\s*11vw,\s*44px\)/u);
  assert.match(css, /\.timeline-list span\s*\{[^{}]*font-size:\s*10px[^{}]*overflow-wrap:\s*anywhere/u);
  assert.match(css, /\.witness-order, \.witness-record\s*\{[^{}]*min-width:\s*0/u);
  assert.match(css, /\.witness-record blockquote\s*\{[^{}]*overflow-wrap:\s*anywhere/u);
  assert.match(css, /\.view-tabs\s*\{[^{}]*overflow-x:\s*auto[^{}]*overscroll-behavior-inline:\s*contain/u);
  assert.match(css, /\.returned-shell\s*\{[^{}]*background:\s*#fafaf8[^{}]*color-scheme:\s*light/u);
  assert.match(css, /\.returned-shell \.returned-masthead h1\s*\{[^{}]*var\(--font-geist-sans\)/u);
  assert.match(css, /\.returned-shell \.paper-surface\s*\{[^{}]*box-shadow:\s*none/u);
  assert.match(css, /@media \(max-width:\s*560px\)[\s\S]*?\.returned-shell \.returned-masthead h1\s*\{[^{}]*font-size:\s*30px/u);
  assert.doesNotMatch(css, /font(?:-size|):[^;{}]*(?:^|\s)(?:8|9)px/u);
  assert.match(restoredSiteSource, /className="recovery-ribbon-toggle"[\s\S]*?aria-expanded=\{ribbonOpen\}[\s\S]*?result\.receipt\.temporalSelection/u);
  assert.match(restoredSiteSource, /result\.outcome === "restored" \? "Recovered edition" : "Evidence record"/u);
  assert.match(restoredSiteSource, /result\.outcome === "restored" \? "returned pages" : "page witnesses"/u);
  assert.match(restoredSiteSource, /Normalized reading view\.[\s\S]*?Historical text and images are exact archived evidence/u);
  assert.match(restoredSiteSource, /new Intl\.DateTimeFormat\("en-US",[\s\S]*?timeZone:\s*"UTC"[\s\S]*?timeZoneName:\s*"short"/u);
  assert.doesNotMatch(restoredSiteSource, /role="radio"|aria-checked/u);
  assert.equal(
    [...restoredSiteSource.matchAll(/When the page is gone, its neighbors become witnesses\./gu)].length,
    1,
    "the Papyrus Principle must appear exactly once in the restored-site interface",
  );
  assert.match(
    restoredSiteSource,
    /view === "map"[\s\S]*?id="map-heading"[\s\S]*?When the page is gone, its neighbors become witnesses\.[\s\S]*?bounded same-site archive records[\s\S]*?structure or known absence[\s\S]*?Unwitnessed material remains missing\./u,
  );
  const recoveryFormMarkup = renderToStaticMarkup(createElement(RecoveryForm));
  const recoveryInputMarkup = recoveryFormMarkup.match(/<input[^>]+name="url"[^>]*>/u)?.[0] || "";
  assert.match(recoveryInputMarkup, /type="text"/u);
  assert.match(recoveryInputMarkup, /inputMode="url"/u);
  assert.match(recoveryInputMarkup, /required=""/u);
  assert.match(recoveryInputMarkup, /aria-describedby="recovery-input-hint"/u);
  assert.doesNotMatch(recoveryInputMarkup, /type="url"|pattern=/u);
  assert.match(recoveryFormMarkup, /you may omit the protocol/u);
  assert.doesNotMatch(`${layout}\n${css}`, unsafeFontReference);
  assert.match(staticHeaders, /(?:^|\r?\n)\/assets\/\*\r?\n\s+Cache-Control:\s*public,\s*max-age=31536000,\s*immutable(?:\r?\n|$)/u);
  assert.match(staticHeaders, /(?:^|\r?\n)\/fonts\/\*\.woff2\r?\n\s+Content-Type:\s*font\/woff2\r?\n\s+Cache-Control:\s*public,\s*max-age=86400\r?\n\s+X-Content-Type-Options:\s*nosniff(?:\r?\n|$)/u);
  assert.match(viteSource, /assets:\s*\{[\s\S]*binding:\s*["']ASSETS["'][\s\S]*\}/u);
  assert.doesNotMatch(viteSource, /run_worker_first/u);
  assert.match(workerSource, /await\s+fetchFontAsset\(request,\s*env\.ASSETS\)/u);
  assert.equal(FONT_CACHE_CONTROL, "public, max-age=86400");
  assert.equal(FONT_WORKER_ROUTE_MARKER, "worker-font-alias-v2");
  for (const [index, publicPath] of FONT_PUBLIC_PATHS.entries()) {
    assert.match(fontDeliverySource, new RegExp(`publicPath:\\s*["']${escapeRegExp(publicPath)}["']`, "u"));
    assert.match(fontDeliverySource, new RegExp(`assetPath:\\s*["']${escapeRegExp(FONT_ASSET_PATHS[index])}["']`, "u"));
    await assert.rejects(stat(path.join(root, "public", publicPath.slice(1))), (error: NodeJS.ErrnoException) => error.code === "ENOENT");
  }
  assert.match(releaseReadiness, /forbiddenGeneratedArtifacts\("dist"\)/u);
  assert.equal(packageContract.scripts.dev, "node scripts/start-local-dev.mjs");
  assert.match(localDevLauncher, /configuredSecret\s*\|\|\s*randomBytes\(32\)\.toString\("hex"\)/u);
  assert.match(localDevLauncher, /configuredSecret\.length\s*<\s*16/u);
  assert.doesNotMatch(localDevLauncher, /console\.log|console\.info/u);
  assert.match(viteSource, /command\s*===\s*["']serve["'][\s\S]*?vars:\s*\{\s*RECOVERY_RATE_LIMIT_SECRET:\s*localAdmissionSecret\s*\}/u);
  assert.equal(packageContract.scripts.start, "node scripts/start-compiled-preview.mjs");
  assert.equal(packageContract.scripts["qa:production"], "node scripts/production-smoke.mjs");
  assert.equal(packageContract.scripts["qa:submission:live"], "node scripts/submission-live-proof.mjs");
  assert.match(submissionLiveProofWrapper, /ALEXANDRIA_REFERENCE_RECOVERY_PATH = "\/r\/18026989-33be-4011-86ee-19e1754cb22c"/u);
  assert.match(submissionLiveProofWrapper, /ALEXANDRIA_REQUIRE_EXACT_REFERENCE_PROOF = "1"/u);
  assert.match(submissionLiveProofWrapper, /assertExactPathfinderProof,\s*EXACT_PATHFINDER_PROOF/u);
  assert.match(submissionLiveProofWrapper, /readReturnedSite/u);
  assert.match(submissionLiveProofWrapper, /AbortSignal\.timeout\(20_000\)/u);
  assert.match(submissionLiveProofWrapper, /readBounded\(response, 2_000_000\)/u);
  assert.match(submissionLiveProofWrapper, /\/api\/recover\/\$\{recoveryId\}\/receipt/u);
  assert.match(submissionLiveProofWrapper, /assertExactPathfinderProof\(\{ record, receipt, recoveryId \}\)/u);
  assert.match(releaseReadiness, /Live submission proof pin/u);
  assert.match(releaseReadiness, /59a9fbf90d4617db21870b7574fcb772d6d574f934209a126bac30cc5d7a1516/u);
  assert.match(releaseReadiness, /createHash\("sha256"\)[\s\S]*?submissionLiveProofSha256/u);
  assert.deepEqual(EXACT_REFERENCE_PROOF, {
    recoveryId: "18026989-33be-4011-86ee-19e1754cb22c",
    receiptVersion: "1.0",
    planner: "gpt-5.6",
    model: "gpt-5.6-sol",
    manifestHash: "e4eeddc5cc3a0e1c43c7f0f63e869399d3c566824cd0c44dc1a9af706142e773",
    captures: 8,
    preservedPages: 5,
    missingPages: 2,
    renderedBlocks: 347,
    preservedBlocks: 622,
    sourceHashes: 946,
    inferredEdges: 36,
    knownAbsences: 8,
    validations: 10,
    decisions: 15,
  });
  const exactRecord = {
    status: "complete",
    result: {
      outcome: "restored",
      captures: Array.from({ length: EXACT_REFERENCE_PROOF.captures }, () => ({})),
      manifest: {
        pages: [
          ...Array.from({ length: EXACT_REFERENCE_PROOF.preservedPages }, () => ({ status: "preserved" })),
          ...Array.from({ length: EXACT_REFERENCE_PROOF.missingPages }, () => ({ status: "missing" })),
        ],
      },
      warnings: [],
    },
  };
  const exactReceipt: {
    recoveryId: string;
    receiptVersion: string;
    planner: string;
    model: string;
    manifestHash: string;
    captures: object[];
    sourceHashes: object[];
    counts: { renderedBlocks: number; preservedBlocks: number; inferredEdges: number; knownAbsences: number };
    validationResults: Array<{ passed: boolean }>;
    decisions: Array<{ kind: string; proposedBy: string; result: string }>;
    warnings: unknown[];
  } = {
    recoveryId: EXACT_REFERENCE_PROOF.recoveryId,
    receiptVersion: EXACT_REFERENCE_PROOF.receiptVersion,
    planner: EXACT_REFERENCE_PROOF.planner,
    model: EXACT_REFERENCE_PROOF.model,
    manifestHash: EXACT_REFERENCE_PROOF.manifestHash,
    captures: Array.from({ length: EXACT_REFERENCE_PROOF.captures }, () => ({})),
    sourceHashes: Array.from({ length: EXACT_REFERENCE_PROOF.sourceHashes }, () => ({})),
    counts: {
      renderedBlocks: EXACT_REFERENCE_PROOF.renderedBlocks,
      preservedBlocks: EXACT_REFERENCE_PROOF.preservedBlocks,
      inferredEdges: EXACT_REFERENCE_PROOF.inferredEdges,
      knownAbsences: EXACT_REFERENCE_PROOF.knownAbsences,
    },
    validationResults: Array.from({ length: EXACT_REFERENCE_PROOF.validations }, () => ({ passed: true })),
    decisions: [
      { kind: "era_selection", proposedBy: "deterministic", result: "accepted" },
      { kind: "page_order", proposedBy: "gpt-5.6", result: "accepted" },
      ...Array.from({ length: 5 }, () => ({ kind: "primary_witness", proposedBy: "gpt-5.6", result: "accepted" })),
      ...Array.from({ length: 8 }, () => ({ kind: "known_absence", proposedBy: "deterministic", result: "accepted" })),
    ],
    warnings: [],
  };
  assert.deepEqual(assertExactReferenceProof({ record: exactRecord, receipt: exactReceipt, recoveryId: EXACT_REFERENCE_PROOF.recoveryId }), EXACT_REFERENCE_PROOF);
  for (const [mutation, pattern] of [
    [(receipt: typeof exactReceipt) => { receipt.counts.renderedBlocks += 1; }, /headline counts drifted/u],
    [(receipt: typeof exactReceipt) => { receipt.planner = "deterministic"; }, /planner drifted/u],
    [(receipt: typeof exactReceipt) => { receipt.model = "gpt-5.6"; }, /model drifted/u],
    [(receipt: typeof exactReceipt) => { receipt.decisions[1].proposedBy = "deterministic"; }, /decision attribution drifted/u],
    [(receipt: typeof exactReceipt) => { receipt.validationResults[0].passed = false; }, /validation contract drifted/u],
    [(receipt: typeof exactReceipt) => { receipt.manifestHash = "0".repeat(64); }, /manifest hash drifted/u],
  ] as const) {
    const mutatedReceipt = structuredClone(exactReceipt);
    mutation(mutatedReceipt);
    assert.throws(
      () => assertExactReferenceProof({ record: exactRecord, receipt: mutatedReceipt, recoveryId: EXACT_REFERENCE_PROOF.recoveryId }),
      pattern,
    );
  }
  assert.deepEqual(EXACT_PATHFINDER_PROOF, {
    recoveryId: "c6adb317-ee2f-4530-9298-e9eb5fe6efd2",
    receiptVersion: "1.3",
    planner: "gpt-5.6",
    model: "gpt-5.6-sol",
    manifestHash: "03f1c3db3e60688b95faf3b25589cb6610b2697369f9c7ee39fc41ec9a6215ab",
    captures: 8,
    preservedPages: 7,
    missingPages: 1,
    renderedBlocks: 249,
    preservedBlocks: 250,
    sourceHashes: 396,
    inferredEdges: 3,
    knownAbsences: 8,
    validations: 12,
    decisions: 17,
  });
  const pathfinderReceipt = {
    recoveryId: EXACT_PATHFINDER_PROOF.recoveryId,
    receiptVersion: EXACT_PATHFINDER_PROOF.receiptVersion,
    planner: EXACT_PATHFINDER_PROOF.planner,
    model: EXACT_PATHFINDER_PROOF.model,
    manifestHash: EXACT_PATHFINDER_PROOF.manifestHash,
    captures: Array.from({ length: EXACT_PATHFINDER_PROOF.captures }, () => ({})),
    sourceHashes: Array.from({ length: EXACT_PATHFINDER_PROOF.sourceHashes }, () => ({})),
    counts: {
      renderedBlocks: EXACT_PATHFINDER_PROOF.renderedBlocks,
      preservedBlocks: EXACT_PATHFINDER_PROOF.preservedBlocks,
      inferredEdges: EXACT_PATHFINDER_PROOF.inferredEdges,
      knownAbsences: EXACT_PATHFINDER_PROOF.knownAbsences,
    },
    validationResults: Array.from({ length: EXACT_PATHFINDER_PROOF.validations }, () => ({ passed: true })),
    decisions: [
      { kind: "era_selection", proposedBy: "deterministic", result: "accepted" },
      { kind: "page_order", proposedBy: "gpt-5.6", result: "accepted" },
      ...Array.from({ length: 7 }, () => ({ kind: "primary_witness", proposedBy: "gpt-5.6", result: "accepted" })),
      ...Array.from({ length: 8 }, () => ({ kind: "known_absence", proposedBy: "deterministic", result: "accepted" })),
    ],
    warnings: [],
  };
  const pathfinderRecord = {
    id: EXACT_PATHFINDER_PROOF.recoveryId,
    status: "complete",
    result: {
      id: EXACT_PATHFINDER_PROOF.recoveryId,
      outcome: "restored",
      captures: Array.from({ length: EXACT_PATHFINDER_PROOF.captures }, () => ({})),
      manifest: {
        pages: [
          ...Array.from({ length: EXACT_PATHFINDER_PROOF.preservedPages }, () => ({ status: "preserved" })),
          ...Array.from({ length: EXACT_PATHFINDER_PROOF.missingPages }, () => ({ status: "missing" })),
        ],
      },
      receipt: structuredClone(pathfinderReceipt),
      warnings: [],
    },
  };
  assert.deepEqual(
    assertExactPathfinderProof({ record: pathfinderRecord, receipt: pathfinderReceipt, recoveryId: EXACT_PATHFINDER_PROOF.recoveryId }),
    EXACT_PATHFINDER_PROOF,
  );
  const driftedPathfinderReceipt = structuredClone(pathfinderReceipt);
  driftedPathfinderReceipt.sourceHashes.pop();
  assert.throws(
    () => assertExactPathfinderProof({ record: pathfinderRecord, receipt: driftedPathfinderReceipt, recoveryId: EXACT_PATHFINDER_PROOF.recoveryId }),
    /Pathfinder source-hash count drifted/u,
  );
  const crossRowPathfinderRecord = {
    ...structuredClone(pathfinderRecord),
    id: "00000000-0000-4000-8000-000000000000",
  };
  assert.throws(
    () => assertExactPathfinderProof({ record: crossRowPathfinderRecord, receipt: pathfinderReceipt, recoveryId: EXACT_PATHFINDER_PROOF.recoveryId }),
    /Pathfinder recovery envelope identity drifted/u,
  );
  const normalizedPreviewArguments = normalizePreviewArguments([
    "--port", "3100",
    "--ip=127.0.0.1",
    "--persist-to", ".wrangler/contract-test",
    "--log-level", "warn",
  ], { root });
  assert.deepEqual(normalizedPreviewArguments, [
    "--port", "3100",
    "--ip", "127.0.0.1",
    "--persist-to", path.resolve(root, ".wrangler/contract-test"),
    "--log-level", "warn",
  ]);
  assert.equal(isPathContained(path.join(root, ".wrangler"), path.join(root, ".wrangler", "state")), true);
  assert.equal(isPathContained(path.join(root, ".wrangler"), path.join(root, "dist", "state")), false);
  const rejectedPreviewArguments = [
    ["--remote"], ["-r"], ["--tunnel"], ["--tunnel-name", "public"], ["--no-local"], ["--local=false"],
    ["--config", "other.json"], ["--config=other.json"], ["-cother.json"], ["-c=other.json"], ["--cwd", "dist"],
    ["--assets", "."], ["--env-file", ".env"], ["--var", "KEY:value"], ["worker.js"], ["--ip", "0.0.0.0"],
    ["--persist-to", "dist/state"], ["--persist-to", path.resolve(root, "dist", "state")],
  ];
  for (const arguments_ of rejectedPreviewArguments) {
    assert.throws(() => normalizePreviewArguments(arguments_, { root }), /compiled-preview|loopback-only|\.wrangler/u);
  }
  const sourceConfigPath = path.join(root, "dist", "server", "wrangler.json");
  const sourceConfigFixture = {
    main: "index.js",
    assets: { directory: "../client", binding: "ASSETS" },
    build: { watch_dir: "./src" },
    d1_databases: [{ migrations_dir: "../../drizzle" }],
  };
  const rebasedConfig = rebaseWranglerConfig(sourceConfigFixture, sourceConfigPath);
  assert.equal(rebasedConfig.main, path.resolve(root, "dist/server/index.js"));
  assert.equal(rebasedConfig.assets.directory, path.resolve(root, "dist/client"));
  assert.equal(rebasedConfig.assets.binding, "ASSETS");
  assert.equal("run_worker_first" in rebasedConfig.assets, false);
  assert.equal(rebasedConfig.build.watch_dir, path.resolve(root, "dist/server/src"));
  assert.equal(rebasedConfig.d1_databases[0].migrations_dir, path.resolve(root, "drizzle"));
  assert.equal(rebasedConfig.send_metrics, false, "compiled previews must never re-enable Wrangler telemetry");
  assert.equal(sourceConfigFixture.main, "index.js", "config rebasing must not mutate the built config object");
  const filteredEnvironment = previewEnvironment({
    PATH: "kept",
    WRANGLER_LOG_PATH: "dist/worker.log",
    WRANGLER_REGISTRY_PATH: "dist/registry.json",
    wrangler_output_file_directory: "dist",
    CLOUDFLARE_INCLUDE_PROCESS_ENV: "true",
    CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "true",
    CLOUDFLARE_API_TOKEN: "not-a-real-token",
    CLOUDFLARE_ACCESS_CLIENT_SECRET: "not-a-real-secret",
    CF_ACCOUNT_ID: "not-a-real-account",
    MINIFLARE_ROOT_PATH: "dist/miniflare",
    OPENAI_API_KEY: "not-a-real-key",
    WRANGLER_CF_AUTHORIZATION_TOKEN: "not-a-real-token",
  });
  assert.deepEqual(filteredEnvironment, { PATH: "kept" });
  const previewFilesystemFixture = await mkdtemp(path.join(os.tmpdir(), "alexandria-preview-contract-"));
  try {
    const scratchFixture = path.join(previewFilesystemFixture, ".wrangler");
    const outsideFixture = path.join(previewFilesystemFixture, "outside");
    await Promise.all([mkdir(scratchFixture), mkdir(outsideFixture)]);
    const contained = await ensureContainedDirectory(scratchFixture, path.join(scratchFixture, "state", "nested"));
    assert.equal(contained, path.join(scratchFixture, "state", "nested"));
    const firstConfigDirectory = await createFreshPreviewConfigDirectory(scratchFixture);
    const secondConfigDirectory = await createFreshPreviewConfigDirectory(scratchFixture);
    assert.notEqual(firstConfigDirectory, secondConfigDirectory, "every preview must receive a fresh config directory");
    await writeExclusivePreviewConfig(path.join(firstConfigDirectory, "wrangler.json"), "{}\n");
    await assert.rejects(
      writeExclusivePreviewConfig(path.join(firstConfigDirectory, "wrangler.json"), "replacement\n"),
      /Refusing to replace/u,
    );
    const junction = path.join(scratchFixture, "outside-link");
    try {
      await symlink(outsideFixture, junction, "junction");
      await assert.rejects(
        ensureContainedDirectory(scratchFixture, path.join(junction, "must-not-be-created")),
        /real directory|outside workspace/u,
      );
      assert.equal(await stat(path.join(outsideFixture, "must-not-be-created")).then(() => true, () => false), false);
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      if (!new Set(["EPERM", "EACCES", "ENOSYS"]).has(code)) throw error;
    }
  } finally {
    await rm(previewFilesystemFixture, { recursive: true, force: true });
  }
  const forbiddenArtifactFixtures = [
    "dist/server/.wrangler",
    "DIST/server/.WRANGLER/tmp",
    "dist/worker.log",
    "dist/worker.log.1",
    "dist/worker.log.gz",
    "dist/state.sqlite",
    "dist/state.sqlite-wal",
    "dist/state.sqlite-shm",
    "dist/state.db-wal",
    "dist/state.db-shm",
    "dist/.env",
    "dist/.env.production",
    "dist/.envrc",
    "dist/.env~",
    "dist/.env_backup",
    "dist/.dev.vars.local",
    "dist/.docker/config.json",
    "dist/.kube/config",
    "dist/.ssh/id_rsa",
    "dist/.SSH/ID_ED25519.backup",
    "dist/.aws/credentials",
    "dist/private/id_ecdsa~",
    "dist/bundle.tar.gz",
    "dist/bundle.tar",
    "dist/bundle.tgz",
    "dist/bundle.zip",
    "dist/bundle.gz",
    "dist/bundle.7z",
    "dist/bundle.rar",
    "dist/server-key.pem",
    "dist/private.key",
    "dist/private.key.backup",
    "dist/private.ppk",
  ];
  for (const relativePath of forbiddenArtifactFixtures) {
    assert.equal(isForbiddenArtifactPath(relativePath), true, `${relativePath} must be excluded from Sites artifacts`);
  }
  assert.equal(isForbiddenArtifactPath("dist/client/benign-link", { symbolicLink: true }), true);
  assert.equal(forbiddenArtifactReason("dist/client/benign-link", { symbolicLink: true }), "symbolic link");
  for (const legitimatePath of ["dist/server/wrangler.json", "dist/.openai/drizzle/0000.sql", "dist/client/assets/index.css", "dist/client/fonts/geist-latin.woff2"]) {
    assert.equal(isForbiddenArtifactPath(legitimatePath), false, `${legitimatePath} must remain packageable`);
  }
  assert.equal(isForbiddenArtifactPath("dist/client/assets/.environment.json"), false, ".environment.json must not be mistaken for a dotenv file");
  assert.match(layout, /import\s+\{\s*preload\s*\}\s+from\s+["']react-dom["']/u);
  assert.match(layout, /preload\(\s*["']\/witness-fonts\/geist-latin\.woff2["'][\s\S]{0,180}as:\s*["']font["'][\s\S]{0,180}type:\s*["']font\/woff2["'][\s\S]{0,180}crossOrigin:\s*["']anonymous["']/u);
  assert.match(layout, /preload\(\s*["']\/witness-fonts\/cormorant-garamond-latin\.woff2["'][\s\S]{0,180}as:\s*["']font["'][\s\S]{0,180}type:\s*["']font\/woff2["'][\s\S]{0,180}crossOrigin:\s*["']anonymous["']/u);
  assert.match(css, /url\(["']\/witness-fonts\/geist-latin\.woff2["']\)/u);
  assert.equal(css.match(/url\(["']\/witness-fonts\/cormorant-garamond-latin\.woff2["']\)/gu)?.length, 4);
  for (const assetPath of FONT_ASSET_PATHS) assert.doesNotMatch(`${layout}\n${css}`, new RegExp(escapeRegExp(assetPath), "u"));

  const fontContracts = [
    ["geist-latin.woff2", 29_288, "9B6F5FF45B278C744B5F379A2C4ECBAF858A842B8EAF82AC8D21B699CA16C608"],
    ["cormorant-garamond-latin.woff2", 37_776, "5D618C462B7A5B74F442E1548880086AF71764D9CC7D35C16AB45353DA934621"],
  ] as const;
  for (const [name, size, hash] of fontContracts) {
    const font = await readFile(path.join(root, "public", "fonts", name));
    assert.equal(font.subarray(0, 4).toString("ascii"), "wOF2", `${name} must be WOFF2`);
    assert.equal(font.length, size, `${name} byte length drifted`);
    assert.equal(sha256(font), hash, `${name} hash drifted`);
  }
  const geistLicense = await readFile(path.join(root, "public", "fonts", "LICENSE-Geist.txt"), "utf8");
  const cormorantLicense = await readFile(path.join(root, "public", "fonts", "LICENSE-Cormorant-Garamond.txt"), "utf8");
  assert.match(geistLicense, /Copyright 2024 The Geist Project Authors/u);
  assert.match(cormorantLicense, /Copyright 2015 the Cormorant Project Authors/u);
  assert.match(geistLicense, /SIL OPEN FONT LICENSE Version 1\.1/u);
  assert.match(cormorantLicense, /SIL OPEN FONT LICENSE Version 1\.1/u);

  const surfaceBackgrounds = {
    returned: cssDeclaration(cssRule(css, ".returned-shell", "background"), "background"),
    paper: cssDeclaration(cssRule(css, ".paper-surface", "background"), "background"),
  } as const;
  const contrastContracts = [
    [".original-address", "returned"],
    [".restored-nav a.missing-link", "returned"],
    [".source-count", "paper"],
    [".recovered-image figcaption", "paper"],
    [".overview-evidence-summary span", "paper"],
    [".returned-footer", "returned"],
  ] as const;
  assert.equal(contrastContracts.length, 6);
  assert.equal(contrastRatio("#000000", "#ffffff"), 21);
  assert.ok(contrastRatio("#707a81", "#101419") < 4.5, "the original low-contrast token must remain a rejecting fixture");
  for (const [selector, surface] of contrastContracts) {
    const foreground = resolveCssColor(css, cssDeclaration(cssRule(css, selector, "color"), "color"));
    const background = resolveCssColor(css, surfaceBackgrounds[surface]);
    const ratio = contrastRatio(foreground, background);
    assert.ok(ratio >= 4.5, `${selector} contrast ${ratio.toFixed(3)}:1 is below WCAG AA 4.5:1`);
  }
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

test("the MP4 parser reads the final sealed master duration without external binaries", async () => {
  const master = await readFile(path.join(assets, "alexandria-here-build-week-demo.mp4"));
  assert.ok(Math.abs(mp4DurationSeconds(master) - 151.04) < 0.001);
  assert.throws(() => mp4DurationSeconds(master.subarray(8)), /ftyp|MP4 box/);
});

test("narration comparison tolerates punctuation but not changed words", () => {
  assert.deepEqual(normalizedWords("hostile-HTML — evidence"), normalizedWords("hostile HTML evidence"));
  assert.notDeepEqual(normalizedWords("evidence is present"), normalizedWords("evidence was present"));
});

test("YouTube reference state permits exactly one pending marker or one published URL", () => {
  assert.equal(classifyYouTubeReference("Demo: [ADD FINAL PUBLIC YOUTUBE URL — UNDER 3 MINUTES]"), "pending");
  assert.equal(classifyYouTubeReference("Demo: https://youtu.be/abc_123"), "present");
  assert.equal(classifyYouTubeReference("Historical: https://youtu.be/z1FJLdJS93o\nFinal: [ADD FINAL PUBLIC YOUTUBE URL — UNDER 3 MINUTES]"), "pending");
  assert.throws(() => classifyYouTubeReference("Demo: [TODO VIDEO]"), /unsupported placeholders/);
  assert.throws(() => classifyYouTubeReference("Demo: [ADD FINAL PUBLIC YOUTUBE URL — UNDER 3 MINUTES] https://youtu.be/abc_123"), /both/);
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

test("final mode cannot bypass either Devpost text or media synchronization", () => {
  const text = "Replace the saved Devpost About and judge instructions with the version 23 `DEVPOST_FIELD_COPY.md`, save, then verify Preview shows `100 passing tests`, the current runtime, and both presentation recoveries.";
  const media = "Upload the final version 23 Devpost thumbnail and gallery media, then verify the public preview.";
  const state = (textComplete: boolean, mediaComplete: boolean) => classifyDevpostSynchronization([
    `- [${textComplete ? "x" : " "}] ${text}`,
    `- [${mediaComplete ? "x" : " "}] ${media}`,
  ].join("\n"));

  assert.equal(state(false, false), "pending");
  assert.equal(state(false, true), "pending");
  assert.equal(state(true, false), "pending");
  assert.equal(state(true, true), "complete");
  assert.equal(submissionExitCode([{
    section: "External authority",
    name: "Devpost v23 synchronization",
    state: state(false, true) === "pending" ? "PENDING" : "PASS",
    detail: "fixture",
  }], true), 1);
});

test("the historical publication URL cannot satisfy the final publication gate", async () => {
  const submission = await readFile(path.join(root, "SUBMISSION.md"), "utf8");
  const completed = submission
    .replace("- [ ] Upload the locally audited final version 23 video, captions, and thumbnail as one sealed set.", "- [x] Upload the locally audited final version 23 video, captions, and thumbnail as one sealed set.")
    .replace("- [ ] Verify the final public YouTube page exposes 1080p, audio, captions, and embedding, then replace the Devpost video URL and verify its embedded player.", "- [x] Verify the final public YouTube page exposes 1080p, audio, captions, and embedding, then replace the Devpost video URL and verify its embedded player.")
    .replace("- [ ] Replace the saved Devpost About and judge instructions with the version 23 `DEVPOST_FIELD_COPY.md`, save, then verify Preview shows `100 passing tests`, the current runtime, and both presentation recoveries.", "- [x] Replace the saved Devpost About and judge instructions with the version 23 `DEVPOST_FIELD_COPY.md`, save, then verify Preview shows `100 passing tests`, the current runtime, and both presentation recoveries.")
    .replace("- [ ] Upload the final version 23 Devpost thumbnail and gallery media, then verify the public preview.", "- [x] Upload the final version 23 Devpost thumbnail and gallery media, then verify the public preview.");

  assert.throws(() => classifyFinalPresentationMedia(completed), /URL is still pending/);
  assert.throws(() => classifyFinalDevpostSynchronization(completed), /URL is still pending|final presentation media gate/);

  const published = completed.replace("[ADD FINAL PUBLIC YOUTUBE URL — UNDER 3 MINUTES]", "https://youtu.be/final_v23");
  assert.equal(classifyFinalPresentationMedia(published), "complete");
  assert.equal(classifyFinalDevpostSynchronization(published), "complete");
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
