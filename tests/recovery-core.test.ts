import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EvidenceBlockView, knownAbsencesForResult } from "../app/r/[id]/[[...path]]/restored-site";
import {
  deriveCaptureId,
  discoverCaptures,
  rankTemporalWindows,
  RECOVERY_BUDGETS,
  RequestedEraUnavailableError,
  selectTemporalWindow,
  validateCaptureReplayIdentity,
} from "../lib/archive";
import { mapSettledWithConcurrency } from "../lib/concurrency";
import { buildEvidenceGraph } from "../lib/evidence-graph";
import { extractSourceRecord } from "../lib/extractor";
import type { Capture, RecoveryResult, TemporalCandidateWindow, TemporalSelectionScore } from "../lib/domain";
import {
  buildPageCandidates,
  createManifestAndReceipt,
  deriveEvidenceNavigation,
  preservedPageTitlesHaveExactEvidence,
  type TemporalPlan,
  validateChronologistPlan,
} from "../lib/planner";
import { canonicalPath, isSameSiteUrl, validateArchiveUrl, validateSubmittedUrl } from "../lib/url-safety";
import { MAX_PERSISTED_RECOVERY_BYTES, serializePersistedRecovery } from "../lib/persistence-budget";
import { parsePersistedRecoveryResult } from "../lib/recovery-compat";
import { aggregateRecoveryWarnings } from "../lib/recovery-warnings";
import { evidenceBlockHashInput, legacyEvidenceBlockHashInput, sha256, stableStringify } from "../lib/hash";

const capture: Capture = {
  id: "capture-home-20030401000000",
  sourceId: "source-capture-home-20030401000000",
  originalUrl: "http://example.org/index.html",
  archiveUrl: "https://web.archive.org/web/20030401000000id_/http://example.org/index.html",
  timestamp: "20030401000000",
  capturedAt: "2003-04-01T00:00:00Z",
  statusCode: 200,
  mimeType: "text/html",
  warnings: [],
};

test("persisted recovery JSON fails honestly before D1's row limit", () => {
  assert.equal(serializePersistedRecovery({ ok: true }), '{"ok":true}');
  assert.throws(
    () => serializePersistedRecovery({ evidence: "x".repeat(MAX_PERSISTED_RECOVERY_BYTES) }),
    /durable storage budget/,
  );
});

function inventoryCapture(path: string, capturedAt: string, digest?: string): Capture {
  const timestamp = capturedAt.replace(/[-:TZ.]/g, "").slice(0, 14);
  const originalUrl = `http://example.org${path}`;
  return {
    id: `capture-${path.replace(/\W/g, "-")}-${timestamp}`,
    sourceId: `source-${path.replace(/\W/g, "-")}-${timestamp}`,
    originalUrl,
    archiveUrl: `https://web.archive.org/web/${timestamp}id_/${originalUrl}`,
    timestamp,
    capturedAt,
    statusCode: 200,
    mimeType: "text/html",
    digest,
    warnings: [],
  };
}

async function durableInventoryCapture(path: string, capturedAt: string, digest?: string): Promise<Capture> {
  const candidate = inventoryCapture(path, capturedAt, digest);
  const id = await deriveCaptureId(candidate.originalUrl, candidate.timestamp, digest);
  return { ...candidate, id, sourceId: `source-${id}` };
}

test("archive replay identity binds its timestamp to the exact captured date", () => {
  assert.throws(
    () => validateCaptureReplayIdentity(new URL(capture.archiveUrl), {
      ...capture,
      capturedAt: "2010-04-01T00:00:00Z",
    }),
    /identity/,
  );
});

test("submitted URLs are normalized and unsafe targets fail closed", () => {
  assert.equal(validateSubmittedUrl("HTTP://Example.org/index.html#old"), "http://example.org/index.html");
  assert.equal(validateSubmittedUrl("iexile.com"), "http://iexile.com/");
  assert.equal(validateSubmittedUrl("www.example.org/archive#old"), "http://www.example.org/archive");
  assert.equal(validateSubmittedUrl("example.org:80/archive"), "http://example.org/archive");
  for (const unsafe of [
    "http://localhost/",
    "http://localhost./",
    "http://intranet/",
    "http://127.0.0.1/",
    "http://2130706433/",
    "http://[::ffff:127.0.0.1]/",
    "http://[::1]/",
    "http://192.168.1.20/",
    "http://100.64.0.1/",
    "http://198.18.0.1/",
    "http://203.0.113.10/",
    "http://224.0.0.1/",
    "http://service.internal./",
    "http://example.test/",
    "ftp://example.org/",
    "http://user:secret@example.org/",
    "https://example.org:8443/",
    "https://example.org/archive?token=secret",
    "https://example.org/?email=reader%40example.org&session=private",
    "javascript:alert(1)",
    "localhost",
    "127.0.0.1",
    "[::1]",
    "user:secret@example.org",
    "example.org:8443",
    "example.org/archive?token=secret",
  ]) {
    assert.throws(() => validateSubmittedUrl(unsafe));
  }
  assert.throws(
    () => validateSubmittedUrl("https://example.org/archive?token=secret"),
    /query parameters.*sensitive information/i,
  );
});

test("rendered navigation ignores invented planner labels and cites exact title evidence", () => {
  const pages = [
    {
      id: "page-home",
      path: "/",
      title: "The Surviving Home Title",
      status: "preserved" as const,
      sourceIds: ["source-old", "source-primary"],
      primarySourceId: "source-primary",
      supportingSourceIds: ["source-old"],
      blockIds: ["block-home"],
    },
    {
      id: "page-about",
      path: "/about-us",
      title: "About Us",
      status: "preserved" as const,
      sourceIds: ["source-about"],
      primarySourceId: "source-about",
      supportingSourceIds: [],
      blockIds: ["block-about"],
    },
  ];
  const navigation = deriveEvidenceNavigation(["page-about", "page-home"], pages);

  assert.deepEqual(navigation, [
    { pageId: "page-about", label: "About Us", sourceIds: ["source-about"] },
    { pageId: "page-home", label: "The Surviving Home Title", sourceIds: ["source-primary"] },
  ]);
  assert.ok(navigation.every((item) => !/crypto|hostile|invented/i.test(item.label)));
});

test("archive retrieval cannot leave the single-provider allowlist", () => {
  assert.equal(
    validateArchiveUrl("https://web.archive.org/web/20030401000000id_/http://example.org/").hostname,
    "web.archive.org",
  );
  assert.throws(() => validateArchiveUrl("https://example.org/archive"));
  assert.throws(() => validateArchiveUrl("http://web.archive.org/archive"));
  assert.throws(() => validateArchiveUrl("https://user@web.archive.org/archive"));
  assert.throws(() => validateArchiveUrl("https://web.archive.org.evil.example/archive"));
});

test("extraction treats archived HTML as inert data and hashes exact evidence blocks", async () => {
  const record = await extractSourceRecord(
    capture,
    `<!doctype html><html><head><title>A Lost Place</title><script>steal()</script></head>
      <body><main><h1 onclick="steal()">Welcome home</h1><p>Exact surviving words.</p>
      <a href="/memorial.html">Memorial</a><a href="https://elsewhere.example/">Elsewhere</a>
      <a href="http://example.org@evil.example/">Deceptive link</a>
      <img src="javascript:alert(1)" onerror="steal()" alt="Unsafe image">
      <iframe src="https://evil.example/"></iframe><svg onload="steal()"><text>Hidden script surface</text></svg></main></body></html>`,
    "http://example.org/",
  );

  assert.equal(record.canonicalPath, "/");
  assert.equal(record.internalLinks.length, 1);
  assert.equal(record.internalLinks[0].targetUrl, "http://example.org/memorial.html");
  assert.ok(record.blocks.some((block) => block.exactText === "Exact surviving words."));
  assert.ok(record.blocks.every((block) => /^[a-f0-9]{64}$/.test(block.contentHash)));
  assert.ok(record.blocks.every((block) => !block.exactText.includes("steal")));
  assert.ok(record.blocks.every((block) => !block.exactText.includes("Hidden script surface")));
  assert.ok(record.blocks.every((block) => block.kind !== "image"));
});

test("missing image alt text stays unclaimed in evidence and rendering", async () => {
  const record = await extractSourceRecord(
    capture,
    `<html><head><title>Images</title></head><body><main><p>Witnessed body.</p>
      <img src="/unlabelled.png"><img src="/blank.png" alt="  "><img src="/labelled.png" alt="Witnessed portrait">
    </main></body></html>`,
    "http://example.org/",
  );
  const images = record.blocks.filter((block) => block.kind === "image");
  assert.deepEqual(images.map((block) => block.exactText), ["", "", "Witnessed portrait"]);
  assert.ok(images.slice(0, 2).every((block) => block.warnings.includes("missing_image_alt")));
  assert.deepEqual(images[2].warnings, []);
  assert.ok(images.every((block) => block.exactText !== "Image"));

  const markup = renderToStaticMarkup(createElement(EvidenceBlockView, { block: images[0], witness: false }));
  assert.match(markup, /<img[^>]+alt=""/u);
  assert.doesNotMatch(markup, /<figcaption>|>Image</u);
});

test("extraction preserves source DOM order and reports only real body truncation", async () => {
  const ordered = await extractSourceRecord(
    capture,
    "<html><head><title>Ordered</title></head><body><main><h2>First heading</h2><p>First paragraph.</p><h3>Second heading</h3><blockquote>A witnessed quote.</blockquote><ul><li>Last item</li></ul></main></body></html>",
    "http://example.org/",
  );
  assert.deepEqual(
    ordered.blocks
      .filter((block) => ["heading", "paragraph", "quote", "list_item"].includes(block.kind))
      .map((block) => [block.kind, block.exactText]),
    [
      ["heading", "First heading"],
      ["paragraph", "First paragraph."],
      ["heading", "Second heading"],
      ["quote", "A witnessed quote."],
      ["list_item", "Last item"],
    ],
  );

  const evidenceHeavy = await extractSourceRecord(
    capture,
    `<html><head><title>Many witnesses</title></head><body><main>
      ${Array.from({ length: 70 }, (_, index) => `<p>Paragraph ${index}.</p>`).join("")}
      ${Array.from({ length: 40 }, (_, index) => `<a href="/path-${index}">Path ${index}</a>`).join("")}
      ${Array.from({ length: 12 }, (_, index) => `<img src="/image-${index}.png" alt="Image ${index}">`).join("")}
    </main></body></html>`,
    "http://example.org/",
  );
  assert.equal(evidenceHeavy.warnings.includes("block_limit_reached"), false);

  const truncated = await extractSourceRecord(
    capture,
    `<html><head><title>Truncated</title></head><body><main>${Array.from({ length: 81 }, (_, index) => `<p>Unique body ${index}.</p>`).join("")}</main></body></html>`,
    "http://example.org/",
  );
  assert.equal(truncated.blocks.filter((block) => block.kind === "paragraph").length, 80);
  assert.equal(truncated.warnings.includes("block_limit_reached"), true);

  const secondTruncated = await extractSourceRecord(
    { ...capture, id: "capture-second-20030402000000", sourceId: "source-capture-second-20030402000000" },
    `<html><head><title>Also truncated</title></head><body><main>${Array.from({ length: 82 }, (_, index) => `<p>Second body ${index}.</p>`).join("")}</main></body></html>`,
    "http://example.org/",
  );
  assert.deepEqual(truncated.warnings, ["block_limit_reached"]);
  assert.deepEqual(secondTruncated.warnings, ["block_limit_reached"]);
  assert.deepEqual(aggregateRecoveryWarnings(truncated.warnings, secondTruncated.warnings), ["block_limit_reached"]);
});

test("literal archived line-break markers do not leak into titles or navigation labels", async () => {
  const record = await extractSourceRecord(
    capture,
    "<html><head><title>Africa<br>March 1998</title></head><body><main><p>Witnessed.</p></main></body></html>",
    "http://example.org/",
  );
  assert.equal(record.title, "Africa March 1998");
});

test("extraction preserves semantic break boundaries and records every bounded text truncation", async () => {
  const overLimit = `${"A".repeat(2_100)}TAIL`;
  const record = await extractSourceRecord(
    capture,
    `<html><head><title>${overLimit}</title></head><body><main>
      <p>Line one<br>Line two</p>
      <blockquote>${overLimit}</blockquote>
      <a href="/lost">${overLimit}</a>
      <img src="/portrait.png" alt="${overLimit}">
    </main></body></html>`,
    "http://example.org/",
  );
  assert.equal(record.blocks.find((block) => block.kind === "paragraph")?.exactText, "Line one Line two");
  for (const [kind, warning] of [
    ["title", "text_truncated:title"],
    ["quote", "text_truncated:quote"],
    ["link", "text_truncated:link_label"],
    ["image", "text_truncated:image_alt"],
  ] as const) {
    const block = record.blocks.find((candidate) => candidate.kind === kind)!;
    assert.equal(block.exactText.length, 2_000);
    assert.deepEqual(block.warnings, [warning]);
  }

  const score: TemporalSelectionScore = {
    version: "deterministic-year-v1",
    score: 10,
    reason: "one bounded truncation fixture",
    coverage: 1,
    densityProxy: 0,
    timeSpreadDays: 0,
    duplicateCount: 0,
    conflictCount: 0,
    inventoryRecordsConsidered: 1,
  };
  const temporalCandidates: TemporalCandidateWindow[] = [{
    id: "year-2003",
    year: "2003",
    windowStart: capture.capturedAt,
    windowEnd: capture.capturedAt,
    captureCount: 1,
    pageCoverage: 1,
    score,
    selected: true,
  }];
  const previousKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const planned = await createManifestAndReceipt({
      recoveryId: "test-scoped-truncation-warnings",
      originalUrl: "http://example.org/",
      selectedYear: "2003",
      windowStart: capture.capturedAt,
      windowEnd: capture.capturedAt,
      temporalSelection: score,
      temporalCandidates,
      records: [record],
      graph: buildEvidenceGraph([record]),
      createdAt: capture.capturedAt,
    });
    for (const raw of [
      "text_truncated:title",
      "text_truncated:quote",
      "text_truncated:link_label",
      "text_truncated:image_alt",
    ]) {
      const warning = planned.receipt.warnings.find((candidate) => candidate.raw === raw);
      assert.equal(warning?.category, "extraction");
      assert.equal(warning?.occurrences.length, 1);
      assert.equal(warning?.occurrences[0].scope, "block");
      assert.ok(warning?.occurrences[0].blockId);
    }
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});

test("body-rich pages without an exact title witness are reconstructed, never Preserved", async () => {
  const paths = ["/", "/about", "/work", "/links", "/contact"];
  const records = await Promise.all(paths.map(async (path, index) => {
    const sourceCapture = inventoryCapture(path, `2003-04-0${index + 1}T00:00:00Z`, `title-integrity-${index}`);
    const title = path === "/" ? "" : `<title>${path.slice(1)}</title>`;
    const nextPath = paths[(index + 1) % paths.length];
    return extractSourceRecord(
      sourceCapture,
      `<html><head>${title}</head><body><main><p>Exact body ${index}.</p><a href="${nextPath}">Next</a></main></body></html>`,
      "http://example.org/",
    );
  }));
  const graph = buildEvidenceGraph(records);
  const homeRecord = records.find((record) => record.canonicalPath === "/")!;
  assert.equal(homeRecord.titleBlockId, undefined);
  assert.ok(homeRecord.warnings.includes("missing_title"));
  assert.equal(graph.nodes.find((node) => node.id === homeRecord.id)?.status, "reconstructed_from_sources");

  const score: TemporalSelectionScore = {
    version: "deterministic-year-v1",
    score: 70,
    reason: "5 distinct pages supported; bounded title-integrity fixture",
    coverage: 5,
    densityProxy: 1,
    timeSpreadDays: 4,
    duplicateCount: 0,
    conflictCount: 0,
    inventoryRecordsConsidered: 5,
  };
  const temporalCandidates: TemporalCandidateWindow[] = [{
    id: "year-2003",
    year: "2003",
    windowStart: "2003-04-01T00:00:00Z",
    windowEnd: "2003-04-05T00:00:00Z",
    captureCount: 5,
    pageCoverage: 5,
    score,
    selected: true,
  }];
  const previousKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const planned = await createManifestAndReceipt({
      recoveryId: "test-title-integrity",
      originalUrl: "http://example.org/",
      selectedYear: "2003",
      windowStart: temporalCandidates[0].windowStart,
      windowEnd: temporalCandidates[0].windowEnd,
      temporalSelection: score,
      temporalCandidates,
      records,
      graph,
      createdAt: "2003-04-06T00:00:00Z",
    });
    const home = planned.manifest.pages.find((page) => page.path === "/")!;
    assert.equal(home.status, "reconstructed_from_sources");
    assert.ok(home.blockIds.length > 0, "exact body blocks remain renderable at block-level provenance");
    assert.equal(planned.manifest.outcome, "insufficient_evidence");
    assert.equal(planned.receipt.validationResults.find((result) => result.rule === "preserved_page_titles_have_exact_evidence")?.passed, true);

    const forged = structuredClone(home);
    forged.status = "preserved";
    assert.equal(preservedPageTitlesHaveExactEvidence([forged], records), false);

    const preserved = planned.manifest.pages.find((page) => page.status === "preserved")!;
    assert.ok(preserved, "fixture must retain a preserved page with exact title evidence");
    const forgedTitle = structuredClone(preserved);
    forgedTitle.title = "Invented title";
    assert.equal(preservedPageTitlesHaveExactEvidence([forgedTitle], records), false);
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});

test("the evidence graph records witnessed links to uncaptured paths as known absences", async () => {
  const record = await extractSourceRecord(
    capture,
    "<html><head><title>Home</title></head><body><main><p>Survived.</p><a href='/memorial.html'>Memorial</a></main></body></html>",
    "http://example.org/",
  );
  const graph = buildEvidenceGraph([record]);
  assert.equal(graph.knownAbsences.length, 1);
  assert.equal(graph.knownAbsences[0].path, "/memorial");
  assert.equal(graph.knownAbsences[0].label, "Memorial");
  assert.ok(graph.knownAbsences[0].sourceBlockIds.length > 0);
});

test("an empty archived link label stays empty evidence while its path remains a structural absence label", async () => {
  const record = await extractSourceRecord(
    capture,
    "<html><head><title>Home</title></head><body><main><p>Survived.</p><a href='/memorial.html'><img src='/marker.png' alt=''></a></main></body></html>",
    "http://example.org/",
  );
  const linkBlock = record.blocks.find((block) => block.kind === "link")!;
  assert.equal(linkBlock.exactText, "");
  assert.deepEqual(linkBlock.warnings, ["missing_link_label"]);
  assert.equal(record.internalLinks[0].label, "/memorial");
  const graph = buildEvidenceGraph([record]);
  assert.equal(graph.knownAbsences[0].label, "/memorial");
  assert.deepEqual(graph.knownAbsences[0].sourceBlockIds, [linkBlock.id]);
});

test("all bounded known absences persist and legacy receipts derive them from cited link blocks", async () => {
  const paths = ["/", "/about", "/work", "/links", "/contact"];
  const absencePaths = Array.from({ length: 8 }, (_, index) => `/lost-${index + 1}`);
  const records = await Promise.all(paths.map(async (path, index) => {
    const sourceCapture = await durableInventoryCapture(path, `2003-04-0${index + 1}T00:00:00Z`, `absence-${index}`);
    return extractSourceRecord(
      sourceCapture,
      `<html><head><title>${path === "/" ? "Home" : path.slice(1)}</title></head><body><main><p>Exact body ${index}.</p><p>Exact second body ${index}.</p><a href="${paths[(index + 1) % paths.length]}">Next surviving page</a>${absencePaths.map((absence) => `<a href="${absence}">${absence.slice(1)}</a>`).join("")}</main></body></html>`,
      "http://example.org/",
    );
  }));
  const graph = buildEvidenceGraph(records);
  assert.equal(graph.knownAbsences.length, 8);
  const score: TemporalSelectionScore = {
    version: "deterministic-year-v1",
    score: 60,
    reason: "five preserved pages and eight bounded witnessed absences",
    coverage: 5,
    densityProxy: 0,
    timeSpreadDays: 4,
    duplicateCount: 0,
    conflictCount: 0,
    inventoryRecordsConsidered: 5,
  };
  const temporalCandidates: TemporalCandidateWindow[] = [{
    id: "year-2003",
    year: "2003",
    windowStart: records[0].capture.capturedAt,
    windowEnd: records.at(-1)!.capture.capturedAt,
    captureCount: 5,
    pageCoverage: 5,
    score,
    selected: true,
  }];
  const previousKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const planned = await createManifestAndReceipt({
      recoveryId: "test-all-known-absences",
      originalUrl: "http://example.org/",
      selectedYear: "2003",
      windowStart: temporalCandidates[0].windowStart,
      windowEnd: temporalCandidates[0].windowEnd,
      temporalSelection: score,
      temporalCandidates,
      records,
      graph,
      createdAt: "2003-04-06T00:00:00Z",
    });
    assert.equal(planned.manifest.pages.filter((page) => page.status === "missing").length, 2);
    assert.equal(planned.manifest.knownAbsences?.length, 8);
    assert.equal(planned.receipt.counts.knownAbsences, 8);
    assert.equal(planned.receipt.validationResults.find((result) => result.rule === "known_absences_have_cited_link_blocks")?.passed, true);

    const result: RecoveryResult = {
      id: "test-all-known-absences",
      submittedUrl: "example.org",
      normalizedUrl: "http://example.org/",
      createdAt: "2003-04-06T00:00:00Z",
      outcome: planned.manifest.outcome,
      captures: records.map((record) => record.capture),
      sources: records,
      nodes: graph.nodes,
      edges: graph.edges,
      manifest: planned.manifest,
      receipt: planned.receipt,
      temporalCandidates: planned.receipt.temporalCandidates,
      warnings: planned.receipt.warnings.map((warning) => warning.raw),
    };
    const persistedAbsences = knownAbsencesForResult(result);
    assert.deepEqual(persistedAbsences.map((absence) => absence.path), absencePaths);
    assert.ok(persistedAbsences.every((absence) => absence.sourceBlockIds.length === 5));

    assert.ok(await parsePersistedRecoveryResult(JSON.stringify(result)));

    const forgedText = structuredClone(result);
    forgedText.sources[0].blocks[0].exactText = "Invented durable history";
    assert.equal(await parsePersistedRecoveryResult(JSON.stringify(forgedText)), null);

    const crossPageBlock = structuredClone(result);
    const visiblePages = crossPageBlock.manifest.pages.filter((page) => page.status !== "missing");
    assert.ok(visiblePages.length >= 2 && visiblePages[0].blockIds.length > 0 && visiblePages[1].blockIds.length > 0);
    visiblePages[0].blockIds[0] = visiblePages[1].blockIds[0];
    crossPageBlock.receipt.manifestHash = await sha256(stableStringify(crossPageBlock.manifest));
    assert.equal(await parsePersistedRecoveryResult(JSON.stringify(crossPageBlock)), null);

    const inventedNavigation = structuredClone(result);
    inventedNavigation.manifest.navigation[0].label = "A title no witness supplied";
    inventedNavigation.receipt.manifestHash = await sha256(stableStringify(inventedNavigation.manifest));
    assert.equal(await parsePersistedRecoveryResult(JSON.stringify(inventedNavigation)), null);

    const forgedCounts = structuredClone(result);
    forgedCounts.receipt.counts.knownAbsences = 999;
    assert.equal(await parsePersistedRecoveryResult(JSON.stringify(forgedCounts)), null);

    const forgedValidation = structuredClone(result);
    forgedValidation.receipt.validationResults = [{
      rule: "all_history_certified",
      passed: true,
      detail: "A claim no deterministic validator produced.",
    }];
    assert.equal(await parsePersistedRecoveryResult(JSON.stringify(forgedValidation)), null);

    const forgedDecision = structuredClone(result);
    const primaryDecision = forgedDecision.receipt.decisions.find((decision) => decision.kind === "primary_witness")!;
    primaryDecision.sourceIds = [forgedDecision.sources.at(-1)!.sourceId];
    assert.equal(await parsePersistedRecoveryResult(JSON.stringify(forgedDecision)), null);

    const forgedPlacement = structuredClone(result);
    forgedPlacement.sources[0].canonicalPath = "/forged-location";
    assert.equal(await parsePersistedRecoveryResult(JSON.stringify(forgedPlacement)), null);

    const rehashSources = async (candidate: RecoveryResult) => {
      for (const block of candidate.sources.flatMap((source) => source.blocks)) {
        block.contentHash = await sha256(evidenceBlockHashInput(block));
      }
      candidate.receipt.sourceHashes = candidate.sources.flatMap((source) => source.blocks)
        .map((block) => ({ blockId: block.id, hash: block.contentHash }));
    };
    const replayUrl = (owner: Capture, originalUrl = owner.originalUrl) =>
      `https://web.archive.org/web/${owner.timestamp}id_/${originalUrl}`;

    const crossSiteCapture = structuredClone(result);
    const moveCaptureToHost = (owner: Capture, hostname: string) => {
      const original = new URL(owner.originalUrl);
      original.hostname = hostname;
      owner.originalUrl = original.toString();
      owner.archiveUrl = replayUrl(owner);
    };
    crossSiteCapture.captures.forEach((owner) => moveCaptureToHost(owner, "evil.example"));
    crossSiteCapture.receipt.temporalInventory?.forEach((owner) => moveCaptureToHost(owner, "evil.example"));
    for (const source of crossSiteCapture.sources) {
      moveCaptureToHost(source.capture, "evil.example");
      for (const block of source.blocks) {
        block.originalUrl = source.capture.originalUrl;
        block.archiveUrl = source.capture.archiveUrl;
      }
    }
    await rehashSources(crossSiteCapture);
    assert.equal(await parsePersistedRecoveryResult(JSON.stringify(crossSiteCapture)), null);

    const mismatchedReplay = structuredClone(result);
    const changeReplayOnly = (owner: Capture) => {
      const other = new URL(owner.originalUrl);
      other.hostname = "different.example";
      owner.archiveUrl = replayUrl(owner, other.toString());
    };
    mismatchedReplay.captures.forEach(changeReplayOnly);
    mismatchedReplay.receipt.temporalInventory?.forEach(changeReplayOnly);
    for (const source of mismatchedReplay.sources) {
      changeReplayOnly(source.capture);
      source.blocks.forEach((block) => { block.archiveUrl = source.capture.archiveUrl; });
    }
    await rehashSources(mismatchedReplay);
    assert.equal(await parsePersistedRecoveryResult(JSON.stringify(mismatchedReplay)), null);

    const mismatchedInventoryFacts = structuredClone(result);
    mismatchedInventoryFacts.receipt.temporalInventory![0].warnings.push("forged_inventory_warning");
    assert.equal(await parsePersistedRecoveryResult(JSON.stringify(mismatchedInventoryFacts)), null);

    const invalidCaptureMedia = structuredClone(result);
    const invalidCaptureId = invalidCaptureMedia.captures[0].id;
    const makeInvalidMedia = (owner: Capture) => {
      owner.statusCode = 404;
      owner.mimeType = "application/pdf";
    };
    makeInvalidMedia(invalidCaptureMedia.captures[0]);
    makeInvalidMedia(invalidCaptureMedia.sources.find((source) => source.capture.id === invalidCaptureId)!.capture);
    makeInvalidMedia(invalidCaptureMedia.receipt.temporalInventory!.find((owner) => owner.id === invalidCaptureId)!);
    assert.equal(await parsePersistedRecoveryResult(JSON.stringify(invalidCaptureMedia)), null);

    const erasedInternalLink = structuredClone(result);
    const sourceWithLinks = erasedInternalLink.sources.find((source) => source.internalLinks.length > 0)!;
    sourceWithLinks.internalLinks.pop();
    assert.equal(await parsePersistedRecoveryResult(JSON.stringify(erasedInternalLink)), null);

    const reorderedBlocks = structuredClone(result);
    const reorderedSource = reorderedBlocks.sources.find((source) => source.blocks.filter((block) => block.kind === "paragraph").length >= 2)!;
    const paragraphIndexes = reorderedSource.blocks.flatMap((block, index) => block.kind === "paragraph" ? [index] : []);
    [reorderedSource.blocks[paragraphIndexes[0]], reorderedSource.blocks[paragraphIndexes[1]]] = [
      reorderedSource.blocks[paragraphIndexes[1]],
      reorderedSource.blocks[paragraphIndexes[0]],
    ];
    const reorderedPage = reorderedBlocks.manifest.pages.find((page) => page.primarySourceId === reorderedSource.sourceId)!;
    reorderedPage.blockIds = reorderedSource.blocks.filter((block) => ["heading", "paragraph", "list_item", "quote", "image"].includes(block.kind)).map((block) => block.id);
    reorderedBlocks.receipt.manifestHash = await sha256(stableStringify(reorderedBlocks.manifest));
    assert.equal(await parsePersistedRecoveryResult(JSON.stringify(reorderedBlocks)), null);

    const falseAbsence = structuredClone(result);
    const survivingPath = falseAbsence.manifest.pages.find((page) => page.status !== "missing" && page.path !== "/")!.path;
    const survivingLink = falseAbsence.sources.flatMap((source) => source.blocks)
      .find((block) => block.kind === "link" && block.targetUrl && canonicalPath(block.targetUrl) === survivingPath)!;
    falseAbsence.manifest.knownAbsences![0] = {
      id: "absence-1",
      path: survivingPath,
      label: survivingLink.exactText,
      sourceBlockIds: [survivingLink.id],
    };
    falseAbsence.receipt.manifestHash = await sha256(stableStringify(falseAbsence.manifest));
    assert.equal(await parsePersistedRecoveryResult(JSON.stringify(falseAbsence)), null);

    const forgedEra = structuredClone(result);
    const forgedStart = "1900-01-01T00:00:00.000Z";
    const forgedEnd = "1900-01-02T00:00:00.000Z";
    forgedEra.manifest.selectedWindowStart = forgedStart;
    forgedEra.manifest.selectedWindowEnd = forgedEnd;
    forgedEra.manifest.selectedEraLabel = "Recovered from a coherent window between Jan 1, 1900 and Jan 2, 1900";
    forgedEra.receipt.selectedWindowStart = forgedStart;
    forgedEra.receipt.selectedWindowEnd = forgedEnd;
    for (const candidate of forgedEra.temporalCandidates.filter((item) => item.selected)) {
      candidate.id = "year-1900";
      candidate.year = "1900";
      candidate.windowStart = forgedStart;
      candidate.windowEnd = forgedEnd;
    }
    forgedEra.receipt.temporalCandidates = structuredClone(forgedEra.temporalCandidates);
    forgedEra.receipt.manifestHash = await sha256(stableStringify(forgedEra.manifest));
    assert.equal(await parsePersistedRecoveryResult(JSON.stringify(forgedEra)), null);

    const forgedTemporalScore = structuredClone(result);
    forgedTemporalScore.receipt.temporalSelection.score = 99_999;
    forgedTemporalScore.receipt.temporalSelection.reason = "Recovered from Atlantis";
    forgedTemporalScore.receipt.temporalSelection.coverage = 7;
    for (const candidate of forgedTemporalScore.temporalCandidates.filter((item) => item.selected)) {
      candidate.score = structuredClone(forgedTemporalScore.receipt.temporalSelection);
      candidate.pageCoverage = 7;
    }
    forgedTemporalScore.receipt.temporalCandidates = structuredClone(forgedTemporalScore.temporalCandidates);
    assert.equal(await parsePersistedRecoveryResult(JSON.stringify(forgedTemporalScore)), null);

    const legacyTemporalScore = structuredClone(result);
    legacyTemporalScore.receipt.receiptVersion = "1.0";
    delete legacyTemporalScore.receipt.temporalInventory;
    legacyTemporalScore.receipt.temporalSelection = {
      ...legacyTemporalScore.receipt.temporalSelection,
      score: legacyTemporalScore.receipt.temporalSelection.score - 3,
      reason: "Legacy score used twelve inventory records, including three duplicate variants that this receipt did not persist.",
      duplicateCount: 3,
      inventoryRecordsConsidered: 12,
    };
    for (const candidate of legacyTemporalScore.temporalCandidates.filter((item) => item.selected)) {
      candidate.score = structuredClone(legacyTemporalScore.receipt.temporalSelection);
      candidate.pageCoverage = candidate.score.coverage;
    }
    legacyTemporalScore.receipt.temporalCandidates = structuredClone(legacyTemporalScore.temporalCandidates);
    for (const block of legacyTemporalScore.sources.flatMap((source) => source.blocks)) {
      block.contentHash = await sha256(legacyEvidenceBlockHashInput(block));
    }
    legacyTemporalScore.receipt.sourceHashes = legacyTemporalScore.sources.flatMap((source) => source.blocks)
      .map((block) => ({ blockId: block.id, hash: block.contentHash }));
    assert.ok(await parsePersistedRecoveryResult(JSON.stringify(legacyTemporalScore)));

    const legacy = structuredClone(result);
    delete legacy.manifest.knownAbsences;
    assert.deepEqual(
      knownAbsencesForResult(legacy).map((absence) => absence.path),
      absencePaths,
    );
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});

test("canonical paths reconcile common URL variants", () => {
  assert.equal(canonicalPath("http://example.org/index.php"), "/");
  assert.equal(canonicalPath("http://example.org/About_Us.HTML"), "/about-us");
  assert.equal(canonicalPath("http://example.org/one%2Ftwo.html"), "/one-two");
  assert.doesNotThrow(() => canonicalPath("http://example.org/%E0%A4%A.html"));
});

test("archive canonicalization may remove a leading www without leaving the submitted site", () => {
  assert.equal(isSameSiteUrl("http://example.org:80/page", "https://www.example.org/"), true);
  assert.equal(isSameSiteUrl("https://www.example.org/page", "https://example.org/"), true);
  assert.equal(isSameSiteUrl("https://example.org.evil.test/page", "https://example.org/"), false);
});

test("temporal selection rewards coverage and density while penalizing spread", () => {
  const compact = ["/", "/about", "/work", "/links", "/contact"].map((path, index) =>
    inventoryCapture(path, `2002-04-${String(index + 1).padStart(2, "0")}T00:00:00Z`, `compact-${index}`),
  );
  const scattered = ["/", "/about", "/work", "/links", "/contact"].map((path, index) =>
    inventoryCapture(path, `2003-${String(index * 2 + 1).padStart(2, "0")}-01T00:00:00Z`, `scattered-${index}`),
  );

  const result = selectTemporalWindow([...compact, ...scattered]);
  assert.equal(result.year, "2002");
  assert.equal(result.score.coverage, 5);
  assert.match(result.score.reason, /distinct pages supported/);
  assert.ok(result.score.timeSpreadDays < 7);
});

test("temporal selection exposes digest conflicts and respects the eight-fetch budget", () => {
  const captures = Array.from({ length: 8 }, (_, index) =>
    inventoryCapture(index === 0 ? "/" : `/page-${index}`, "2004-05-01T00:00:00Z", `digest-${index}`),
  );
  captures.push(inventoryCapture("/", "2004-05-02T00:00:00Z", "changed-home"));

  const result = selectTemporalWindow(captures);
  assert.equal(result.selected.length, RECOVERY_BUDGETS.maxFetchedCaptures);
  assert.equal(result.score.inventoryRecordsConsidered, 9);
  assert.equal(result.score.conflictCount, 1);
  assert.match(result.score.reason, /1 digest conflict/);
});

test("an edition keeps five page representatives before differing-digest variants", () => {
  const representatives = ["/", "/about", "/work", "/links", "/contact"].map((path, index) =>
    inventoryCapture(path, `2004-05-0${index + 1}T00:00:00Z`, `primary-${index}`),
  );
  const differingRoot = inventoryCapture("/", "2004-05-06T00:00:00Z", "changed-root");
  const differingAbout = inventoryCapture("/about", "2004-05-07T00:00:00Z", "changed-about");
  const identicalWork = inventoryCapture("/work", "2004-05-08T00:00:00Z", "primary-2");
  const result = selectTemporalWindow([...representatives, differingRoot, differingAbout, identicalWork]);
  assert.equal(result.score.coverage, 5);
  assert.equal(result.selected.length, 7);
  assert.equal(result.selected.filter((item) => canonicalPath(item.originalUrl) === "/").length, 2);
  assert.equal(result.selected.filter((item) => item.digest === "primary-2").length, 1);
  assert.equal(result.score.conflictCount, 2);
});

test("temporal selection fails closed beyond the twelve-record inventory budget", () => {
  const captures = Array.from({ length: 13 }, (_, index) =>
    inventoryCapture(`/page-${index}`, "2005-01-01T00:00:00Z", `digest-${index}`),
  );
  assert.throws(() => selectTemporalWindow(captures), /12-record inventory budget/);
});

test("temporal candidates expose at most three deterministically ranked editions", () => {
  const captures = ["2001", "2002", "2003"].flatMap((year, yearIndex) =>
    ["/", "/about", "/work", "/contact"].map((path, pathIndex) =>
      inventoryCapture(
        path,
        `${year}-0${yearIndex + 2}-${String(pathIndex + 1).padStart(2, "0")}T00:00:00Z`,
        `${year}-${pathIndex}`,
      ),
    ),
  );
  const candidates = rankTemporalWindows(captures);
  assert.equal(candidates.length, 3);
  assert.deepEqual(candidates.map((candidate) => candidate.year), ["2003", "2002", "2001"]);
  assert.ok(candidates.every((candidate) => candidate.selected.length === 4));
  assert.ok(candidates.every((candidate) => candidate.score.inventoryRecordsConsidered === 12));
});

test("a requested era can select only a ranked deterministic candidate", () => {
  const captures = [
    inventoryCapture("/", "2002-01-01T00:00:00Z", "a"),
    inventoryCapture("/about", "2002-01-02T00:00:00Z", "b"),
    inventoryCapture("/", "2003-01-01T00:00:00Z", "c"),
    inventoryCapture("/about", "2003-01-02T00:00:00Z", "d"),
  ];
  assert.equal(selectTemporalWindow(captures, "2002").year, "2002");
  assert.throws(
    () => selectTemporalWindow(captures, "1999"),
    (error) => error instanceof RequestedEraUnavailableError && error.availableYears.length === 2,
  );
  assert.throws(() => selectTemporalWindow(captures, "03"), /exactly four digits/);
});

test("year-scoped inventory recovers a requested era outside the general 400 rows", async () => {
  const paths = Array.from({ length: 20 }, (_, index) => index === 0 ? "/" : `/recent-${index}`);
  const generalRows = [
    ["timestamp", "original", "statuscode", "mimetype", "digest"],
    ...Array.from({ length: 400 }, (_, index) => {
      const year = index % 2 === 0 ? "2009" : "2010";
      const capturedAt = new Date(Date.UTC(Number(year), 0, 1, 0, index)).toISOString();
      return [
      capturedAt.replace(/[-:TZ.]/g, "").slice(0, 14),
      `http://lost-web.org${paths[index % paths.length]}`,
      "200",
      "text/html",
      `recent-${index}`,
      ];
    }),
  ];
  const requestedRows = [
    ["timestamp", "original", "statuscode", "mimetype", "digest"],
    [
      "20070101000000",
      "http://lost-web.org/forgotten",
      "200",
      "text/html",
      "2007-forgotten",
    ],
    [
      "20070102000000",
      "http://lost-web.org/forgotten/about",
      "200",
      "text/html",
      "2007-forgotten-about",
    ],
  ];
  const calls: URL[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(url);
    return Response.json(url.searchParams.get("from") === "2007" ? requestedRows : generalRows);
  };
  try {
    const inventory = await discoverCaptures("http://lost-web.org/", "2007");
    assert.equal(calls.length, 4);
    const generalCalls = calls.filter((url) => !url.searchParams.has("from"));
    const scopedCalls = calls.filter((url) => url.searchParams.get("from") === "2007");
    assert.deepEqual(
      generalCalls.map((url) => new URL(url.searchParams.get("url")!).protocol).sort(),
      ["http:", "https:"],
    );
    assert.deepEqual(
      scopedCalls.map((url) => new URL(url.searchParams.get("url")!).protocol).sort(),
      ["http:", "https:"],
    );
    assert.ok(scopedCalls.every((url) => url.searchParams.get("to") === "2007"));
    assert.ok(scopedCalls.every((url) => url.searchParams.get("limit") === "400"));
    assert.equal(inventory.selectedYear, "2007");
    assert.equal(inventory.selected.length, 2);
    assert.equal(inventory.all.length, RECOVERY_BUDGETS.maxInventoryRecords);
    assert.ok(inventory.selected.every((capture) => canonicalPath(capture.originalUrl).startsWith("/forgotten")));
    assert.ok(inventory.temporalCandidates.some((candidate) => candidate.year === "2009" || candidate.year === "2010"));
    assert.equal(inventory.temporalCandidates.find((candidate) => candidate.year === "2007")?.selected, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("an empty requested-year inventory still fails with supported alternatives", async () => {
  const generalRows = [
    ["timestamp", "original", "statuscode", "mimetype", "digest"],
    ["20090101000000", "http://lost-web.org/", "200", "text/html", "2009-home"],
  ];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    return Response.json(url.searchParams.has("from") ? [generalRows[0]] : generalRows);
  };
  try {
    await assert.rejects(
      () => discoverCaptures("http://lost-web.org/", "2007"),
      (error) => error instanceof RequestedEraUnavailableError
        && error.requestedYear === "2007"
        && error.availableYears.includes("2009"),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("capture identities do not collapse punctuation or protocol-distinct archive witnesses", async () => {
  const rows = [
    ["timestamp", "original", "statuscode", "mimetype", "digest"],
    ["20030401000000", "http://lost-web.org/a-b", "200", "text/html", "hyphen"],
    ["20030401000000", "http://lost-web.org/a-b", "200", "text/html", "hyphen-conflict"],
    ["20030401000000", "http://lost-web.org/a/b", "200", "text/html", "slash"],
    ["20030401000000", "https://lost-web.org/a-b", "200", "text/html", "https"],
  ];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json(rows);
  try {
    const inventory = await discoverCaptures("http://lost-web.org/");
    assert.equal(inventory.all.length, 4);
    assert.equal(new Set(inventory.all.map((item) => item.id)).size, 4);
    assert.equal(new Set(inventory.all.map((item) => item.sourceId)).size, 4);
    assert.deepEqual(
      Array.from(new Set(inventory.all.map((item) => item.originalUrl))).sort(),
      [
        "http://lost-web.org/a-b",
        "http://lost-web.org/a/b",
        "https://lost-web.org/a-b",
      ],
    );
    assert.deepEqual(
      inventory.all
        .filter((item) => item.originalUrl === "http://lost-web.org/a-b")
        .map((item) => item.digest)
        .sort(),
      ["hyphen", "hyphen-conflict"],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("duplicate-path fragments choose one mechanical primary and never concatenate bodies", async () => {
  const weakHomeCapture = inventoryCapture("/", "2003-04-01T00:00:00Z", "home-old");
  const strongHomeCapture = inventoryCapture("/", "2003-04-03T00:00:00Z", "home-new");
  const records = [
    await extractSourceRecord(weakHomeCapture, "<html><title>Old title</title><body><nav>Only chrome</nav></body></html>", "http://example.org/"),
    await extractSourceRecord(strongHomeCapture, "<html><title>Witnessed home</title><body><main><h1>Home</h1><p>Primary exact paragraph.</p><p>Second exact paragraph.</p></main></body></html>", "http://example.org/"),
  ];
  for (const [index, path] of ["/about", "/work", "/links", "/contact"].entries()) {
    const pathCapture = inventoryCapture(path, `2003-04-0${index + 4}T00:00:00Z`, `path-${index}`);
    records.push(await extractSourceRecord(
      pathCapture,
      `<html><title>National Commission on Terrorist Attacks Upon the United States — section ${index}</title><body><main><h1>${path}</h1><p>Exact page ${index}.</p></main></body></html>`,
      "http://example.org/",
    ));
  }
  const graph = buildEvidenceGraph(records);
  assert.ok(graph.conflicts.some((conflict) => conflict.path === "/" && conflict.kind === "title"));
  const score: TemporalSelectionScore = {
    version: "deterministic-year-v1",
    score: 70,
    reason: "5 distinct pages supported; bounded test evidence",
    coverage: 5,
    densityProxy: 1,
    timeSpreadDays: 7,
    duplicateCount: 0,
    conflictCount: 1,
    inventoryRecordsConsidered: 6,
  };
  const temporalCandidates: TemporalCandidateWindow[] = [{
    id: "year-2003",
    year: "2003",
    windowStart: "2003-04-01T00:00:00Z",
    windowEnd: "2003-04-07T00:00:00Z",
    captureCount: 6,
    pageCoverage: 5,
    score,
    selected: true,
  }];
  const previousKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const planned = await createManifestAndReceipt({
      recoveryId: "test-cross-fragments",
      originalUrl: "http://example.org/",
      selectedYear: "2003",
      windowStart: temporalCandidates[0].windowStart,
      windowEnd: temporalCandidates[0].windowEnd,
      temporalSelection: score,
      temporalCandidates,
      records,
      graph,
      createdAt: "2003-04-08T00:00:00Z",
    });
    const home = planned.manifest.pages.find((page) => page.path === "/");
    assert.ok(home);
    assert.equal(planned.manifest.pages.filter((page) => page.status !== "missing").length, 5);
    assert.equal(new Set(planned.manifest.navigation.map((item) => item.label)).size, 5);
    assert.equal(home.title, "Witnessed home");
    assert.equal(home.primarySourceId, strongHomeCapture.sourceId);
    assert.deepEqual(home.supportingSourceIds, [weakHomeCapture.sourceId]);
    assert.ok(home.blockIds.length >= 3);
    assert.ok(home.blockIds.every((id) => records.flatMap((record) => record.blocks).find((block) => block.id === id)?.sourceId === strongHomeCapture.sourceId));
    const decision = planned.receipt.decisions.find((item) => item.kind === "primary_witness" && item.targetIds[0] === home.id);
    assert.equal(decision?.primarySourceId, strongHomeCapture.sourceId);
    assert.deepEqual(decision?.supportingSourceIds, [weakHomeCapture.sourceId]);
    assert.equal(planned.receipt.planner, "deterministic");
    assert.ok(planned.warnings.some((warning) => warning.includes("OPENAI_API_KEY_not_configured")));
    assert.equal(planned.receipt.receiptVersion, "1.2");
    assert.deepEqual(
      planned.receipt.captures.map((item) => item.id),
      records.map((record) => record.capture.id),
    );
    assert.equal(planned.receipt.captures[0].archiveUrl, records[0].capture.archiveUrl);
    assert.ok(planned.receipt.warnings.some((warning) =>
      warning.category === "model_fallback"
      && warning.raw.includes("OPENAI_API_KEY_not_configured")
      && warning.occurrences.some((occurrence) => occurrence.scope === "model")));

    const warningVariant = await createManifestAndReceipt({
      recoveryId: "test-cross-fragments-warning",
      originalUrl: "http://example.org/",
      selectedYear: "2003",
      windowStart: temporalCandidates[0].windowStart,
      windowEnd: temporalCandidates[0].windowEnd,
      temporalSelection: score,
      temporalCandidates,
      recoveryWarnings: [{ raw: "unknown_warning", occurrence: { scope: "recovery" } }],
      records,
      graph,
      createdAt: "2003-04-08T00:00:00Z",
    });
    assert.equal(warningVariant.receipt.manifestHash, planned.receipt.manifestHash);
    assert.ok(warningVariant.receipt.warnings.some((warning) => warning.raw === "unknown_warning"));

    const candidates = buildPageCandidates(records);
    const invalidPlan: TemporalPlan = {
      selectedYear: "2003",
      pageOrder: candidates.map((candidate) => candidate.id),
      navigation: candidates.map((candidate) => ({
        pageId: candidate.id,
        label: candidate.path === "/" ? "Home" : candidate.path.slice(1),
        sourceIds: candidate.records.map((record) => record.sourceId),
      })),
      primaryWitnesses: candidates.map((candidate, index) => ({
        pageId: candidate.id,
        primaryRecordId: index === 0 ? "invented-record" : candidate.records[0].id,
        supportingRecordIds: index === 0 ? candidate.records.map((record) => record.id) : candidate.records.slice(1).map((record) => record.id),
      })),
      decisions: [{
        kind: "page_order",
        targetIds: candidates.map((candidate) => candidate.id),
        sourceIds: candidates.flatMap((candidate) => candidate.records.map((record) => record.sourceId)),
      }],
    };
    assert.throws(
      () => validateChronologistPlan(invalidPlan, planned.manifest.pages, candidates, records, graph, "2003"),
      /primary record outside its page candidate/,
    );
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});

test("bounded async work never exceeds its concurrency limit and preserves input order", async () => {
  let active = 0;
  let peak = 0;
  const completionOrder: number[] = [];
  const results = await mapSettledWithConcurrency([30, 5, 20, 1, 10, 2], 3, async (delay, index) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, delay));
    completionOrder.push(index);
    active -= 1;
    return `item-${index}`;
  });

  assert.equal(peak, 3);
  assert.notDeepEqual(completionOrder, [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(
    results.map((result) => result.status === "fulfilled" ? result.value : "rejected"),
    ["item-0", "item-1", "item-2", "item-3", "item-4", "item-5"],
  );
});

test("bounded async work isolates failures in their deterministic input slots", async () => {
  const results = await mapSettledWithConcurrency(["first", "bad", "last"], 2, async (item) => {
    if (item === "bad") throw new Error("expected failure");
    return item.toUpperCase();
  });

  assert.deepEqual(results.map((result) => result.status), ["fulfilled", "rejected", "fulfilled"]);
  assert.equal(results[0].status === "fulfilled" && results[0].value, "FIRST");
  assert.match(results[1].status === "rejected" ? String(results[1].reason) : "", /expected failure/);
  assert.equal(results[2].status === "fulfilled" && results[2].value, "LAST");
  await assert.rejects(() => mapSettledWithConcurrency([1], 0, async (item) => item), /positive integer/);
});
