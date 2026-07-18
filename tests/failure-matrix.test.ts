import assert from "node:assert/strict";
import test from "node:test";
import { discoverCaptures, fetchCaptureHtml, RequestedEraUnavailableError } from "../lib/archive";
import type { Capture, RecoveryResult } from "../lib/domain";
import { hydrateRecoveryRecord, parsePersistedRecoveryResult } from "../lib/recovery-compat";
import { createReceiptResponse } from "../lib/receipt-response";
import { aggregateRecoveryWarnings, buildReceiptWarnings, modelFallbackWarning } from "../lib/recovery-warnings";

const capture: Capture = {
  id: "capture-home-20030401000000",
  sourceId: "source-capture-home-20030401000000",
  originalUrl: "http://lostsite.org/",
  archiveUrl: "https://web.archive.org/web/20030401000000id_/http://lostsite.org/",
  timestamp: "20030401000000",
  capturedAt: "2003-04-01T00:00:00Z",
  statusCode: 200,
  mimeType: "text/html",
  warnings: [],
};

async function withMockFetch<T>(mock: typeof fetch, task: () => Promise<T>) {
  const original = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    return await task();
  } finally {
    globalThis.fetch = original;
  }
}

test("capture retrieval rejects non-HTML, declared oversize, streamed oversize, and off-allowlist redirects", async () => {
  await withMockFetch(async () => new Response("plain", {
    headers: { "content-type": "text/plain" },
  }), async () => {
    await assert.rejects(() => fetchCaptureHtml(capture), /was not HTML/);
  });

  await withMockFetch(async () => new Response("small", {
    headers: { "content-type": "text/html", "content-length": "2500001" },
  }), async () => {
    await assert.rejects(() => fetchCaptureHtml(capture), /exceeded the response budget/);
  });

  await withMockFetch(async () => new Response("x".repeat(2_500_001), {
    headers: { "content-type": "text/html" },
  }), async () => {
    await assert.rejects(() => fetchCaptureHtml(capture), /exceeded the response budget/);
  });

  let calls = 0;
  await withMockFetch(async () => {
    calls += 1;
    return new Response(null, { status: 302, headers: { location: "https://evil.example/capture" } });
  }, async () => {
    await assert.rejects(() => fetchCaptureHtml(capture), /leave the allowlist/);
  });
  assert.equal(calls, 1);
});

test("empty archive inventory and an unavailable requested era fail explicitly", async () => {
  await withMockFetch(async () => Response.json([
    ["timestamp", "original", "statuscode", "mimetype", "digest"],
  ]), async () => {
    await assert.rejects(() => discoverCaptures("http://lostsite.org/"), /No usable public HTML captures/);
  });

  await withMockFetch(async () => Response.json([
    ["timestamp", "original", "statuscode", "mimetype", "digest"],
    ["20020101000000", "http://lostsite.org/", "200", "text/html", "old"],
    ["20030101000000", "http://lostsite.org/", "200", "text/html", "new"],
  ]), async () => {
    await assert.rejects(
      () => discoverCaptures("http://lostsite.org/", "1999"),
      (error) => error instanceof RequestedEraUnavailableError
        && error.requestedYear === "1999"
        && error.availableYears.includes("2002")
        && error.availableYears.includes("2003"),
    );
  });
});

function legacyResult(warnings: string[] = [], captures: Capture[] = [], sources: unknown[] = []) {
  return {
    id: "legacy-id",
    normalizedUrl: "http://lostsite.org/",
    sources,
    captures,
    warnings,
    manifest: {
      outcome: "restored",
      pages: [{
        id: "page-home",
        path: "/",
        status: "preserved",
        sourceIds: ["source-primary", "source-supporting"],
        primarySourceId: "source-primary",
        blockIds: [],
      }],
    },
    receipt: {
      sourceHashes: [],
      counts: { preservedBlocks: 0, renderedBlocks: 0, inferredEdges: 0, knownAbsences: 0 },
    },
  };
}

test("top-level warning aggregation removes only exact duplicates", () => {
  assert.deepEqual(aggregateRecoveryWarnings(
    ["block_limit_reached", "capture_failed:capture-a:timeout"],
    ["block_limit_reached", "model_fallback:timeout"],
    ["capture_failed:capture-b:timeout", "model_fallback:schema_mismatch", "model_fallback:timeout"],
  ), [
    "block_limit_reached",
    "capture_failed:capture-a:timeout",
    "model_fallback:timeout",
    "capture_failed:capture-b:timeout",
    "model_fallback:schema_mismatch",
  ]);
});

test("model fallback warnings expose bounded reason codes instead of provider exception detail", () => {
  assert.equal(modelFallbackWarning(new Error("request timed out while using sk-secret-material")), "model_fallback:timeout");
  assert.equal(
    modelFallbackWarning(Object.assign(new Error("provider echoed sk-secret-material"), { status: 401 })),
    "model_fallback:authentication_failed",
  );
  const unknown = modelFallbackWarning(new Error("request failed for sk-secret-material"));
  assert.equal(unknown, "model_fallback:provider_error");
  assert.equal(unknown.includes("secret-material"), false);
});

test("receipt warnings group exact raw values while preserving every owner occurrence", () => {
  const warnings = buildReceiptWarnings([
    { raw: "block_limit_reached", occurrence: { scope: "source", captureId: "capture-a", sourceId: "source-a" } },
    { raw: "block_limit_reached", occurrence: { scope: "source", captureId: "capture-a", sourceId: "source-a" } },
    { raw: "block_limit_reached", occurrence: { scope: "source", captureId: "capture-b", sourceId: "source-b" } },
    { raw: "block_limit_reached", occurrence: { scope: "block", captureId: "capture-b", sourceId: "source-b", blockId: "block-b" } },
    { raw: "capture_failed:capture-a:timeout:upstream", occurrence: { scope: "capture", captureId: "capture-a", sourceId: "source-a" } },
    { raw: "capture_failed:capture-b:timeout:upstream", occurrence: { scope: "capture", captureId: "capture-b", sourceId: "source-b" } },
    { raw: "model_fallback:timeout", occurrence: { scope: "model" } },
    { raw: "model_fallback:timeout", occurrence: { scope: "model" } },
    { raw: "model_fallback:schema_mismatch", occurrence: { scope: "model" } },
    { raw: "unknown_warning", occurrence: { scope: "recovery" } },
  ]);
  assert.deepEqual(warnings.map((warning) => [warning.raw, warning.category]), [
    ["block_limit_reached", "extraction"],
    ["capture_failed:capture-a:timeout:upstream", "capture_failure"],
    ["capture_failed:capture-b:timeout:upstream", "capture_failure"],
    ["model_fallback:timeout", "model_fallback"],
    ["model_fallback:schema_mismatch", "model_fallback"],
    ["unknown_warning", "other"],
  ]);
  assert.deepEqual(warnings[0].occurrences, [
    { scope: "source", captureId: "capture-a", sourceId: "source-a" },
    { scope: "source", captureId: "capture-b", sourceId: "source-b" },
    { scope: "block", captureId: "capture-b", sourceId: "source-b", blockId: "block-b" },
  ]);
  assert.equal(warnings.find((warning) => warning.raw === "model_fallback:timeout")?.occurrences.length, 1);
});

test("legacy additive fields are normalized and corrupt durable JSON becomes unavailable", () => {
  assert.equal(parsePersistedRecoveryResult("not-json"), null);
  assert.equal(parsePersistedRecoveryResult(JSON.stringify({ id: "stale" })), null);

  const receiptCapture = { ...capture, warnings: ["capture_metadata_warning"] };
  const parsed = parsePersistedRecoveryResult(JSON.stringify(legacyResult(
    ["capture_metadata_warning", "model_fallback:timeout"],
    [receiptCapture],
    [{
      id: "page-home",
      sourceId: receiptCapture.sourceId,
      capture: receiptCapture,
      blocks: [],
      warnings: ["block_limit_reached"],
    }],
  )));
  assert.ok(parsed);
  assert.deepEqual(parsed.nodes, []);
  assert.deepEqual(parsed.edges, []);
  assert.deepEqual(parsed.temporalCandidates, []);
  assert.deepEqual(parsed.receipt.decisions, []);
  assert.deepEqual(parsed.receipt.validationResults, []);
  assert.deepEqual(parsed.manifest.pages[0].supportingSourceIds, ["source-supporting"]);

  const normalizedWarnings = parsePersistedRecoveryResult(JSON.stringify(legacyResult([
    "block_limit_reached",
    "block_limit_reached",
    "capture_failed:capture-a:timeout",
    "capture_failed:capture-b:timeout",
  ])));
  assert.deepEqual(normalizedWarnings?.warnings, [
    "block_limit_reached",
    "capture_failed:capture-a:timeout",
    "capture_failed:capture-b:timeout",
  ]);

  const warnedCaptureA = { ...capture, id: "capture-a", sourceId: "source-a", warnings: [] };
  const warnedCaptureB = { ...capture, id: "capture-b", sourceId: "source-b", warnings: [] };
  const warnedSources = [
    { id: "page-a", sourceId: "source-a", capture: warnedCaptureA, blocks: [], warnings: ["block_limit_reached"] },
    { id: "page-b", sourceId: "source-b", capture: warnedCaptureB, blocks: [], warnings: ["block_limit_reached"] },
  ];
  const warnedLegacy = parsePersistedRecoveryResult(JSON.stringify(legacyResult([
    "block_limit_reached",
    "block_limit_reached",
    "capture_failed:capture-b:timeout:with:colons",
    "model_fallback:provider_timeout",
  ], [warnedCaptureA, warnedCaptureB], warnedSources)));
  assert.ok(warnedLegacy);
  assert.deepEqual(warnedLegacy.receipt.captures.map((item) => item.id), ["capture-a", "capture-b"]);
  assert.deepEqual(warnedLegacy.receipt.warnings.map((warning) => warning.raw), [
    "block_limit_reached",
    "capture_failed:capture-b:timeout:with:colons",
    "model_fallback:provider_timeout",
  ]);
  assert.deepEqual(warnedLegacy.receipt.warnings[0].occurrences, [
    { scope: "source", captureId: "capture-a", sourceId: "source-a" },
    { scope: "source", captureId: "capture-b", sourceId: "source-b" },
  ]);
  assert.deepEqual(warnedLegacy.receipt.warnings[1].occurrences, [
    { scope: "capture", captureId: "capture-b", sourceId: "source-b" },
  ]);

  const hydrated = hydrateRecoveryRecord({
    id: "legacy-id",
    status: "complete",
    resultJson: JSON.stringify(legacyResult()),
  });
  assert.equal("resultJson" in hydrated, false);
  assert.equal(hydrated.result?.id, "legacy-id");
});

test("partial receipt metadata fails soft by merging valid persisted capture and warning owners", () => {
  const captureA = { ...capture, id: "capture-a", sourceId: "source-a", warnings: [] };
  const captureB = {
    ...capture,
    id: "capture-b",
    sourceId: "source-b",
    archiveUrl: "https://web.archive.org/web/20030402000000id_/http://lostsite.org/about",
    capturedAt: "2003-04-02T00:00:00.000Z",
    warnings: ["capture_metadata_warning"],
  };
  const sources = [
    { id: "page-a", sourceId: "source-a", capture: captureA, blocks: [], warnings: ["block_limit_reached"] },
    { id: "page-b", sourceId: "source-b", capture: captureB, blocks: [], warnings: ["block_limit_reached"] },
  ];
  const base = legacyResult(
    ["block_limit_reached", "model_fallback:provider_timeout", "unknown_warning"],
    [captureA, captureB],
    sources,
  );
  const parsed = parsePersistedRecoveryResult(JSON.stringify({
    ...base,
    receipt: {
      ...base.receipt,
      captures: [
        { malformed: true },
        { ...captureA, statusCode: 404, mimeType: "text/receipt-conflict" },
        {
          ...captureB,
          id: "capture-invalid-only",
          sourceId: "source-invalid-only",
          statusCode: "200",
          mimeType: "",
        },
        {
          ...captureB,
          id: "capture-receipt-only",
          sourceId: "source-receipt-only",
        },
      ],
      warnings: [
        {
          raw: "block_limit_reached",
          category: "incorrect-category-is-recomputed",
          occurrences: [{ scope: "source", captureId: "capture-a", sourceId: "source-a" }],
        },
        { raw: "block_limit_reached", occurrences: [{ scope: "source" }] },
        {
          raw: "model_fallback:provider_timeout",
          occurrences: [{ scope: "model", captureId: "forged-capture", sourceId: "forged-source" }],
        },
        {
          raw: "unknown_warning",
          occurrences: [{ scope: "source", sourceId: "forged-source" }],
        },
        { raw: "ownerless_only", occurrences: [{ scope: "block", blockId: "ownerless-block" }] },
        { raw: "malformed_warning", occurrences: "not-an-array" },
      ],
    },
  }));

  assert.ok(parsed);
  assert.deepEqual(parsed.receipt.captures.map((item) => item.id), ["capture-a", "capture-b"]);
  assert.equal(parsed.receipt.captures[0].statusCode, captureA.statusCode);
  assert.equal(parsed.receipt.captures[0].mimeType, captureA.mimeType);
  assert.equal(parsed.receipt.captures[1].archiveUrl, captureB.archiveUrl);
  assert.deepEqual(parsed.receipt.warnings.map((warning) => warning.raw), [
    "block_limit_reached",
    "model_fallback:provider_timeout",
    "unknown_warning",
    "capture_metadata_warning",
  ]);
  assert.deepEqual(parsed.receipt.warnings[0].occurrences, [
    { scope: "source", captureId: "capture-a", sourceId: "source-a" },
    { scope: "source", captureId: "capture-b", sourceId: "source-b" },
  ]);
  assert.equal(parsed.receipt.warnings[0].category, "extraction");
  assert.deepEqual(parsed.receipt.warnings[1].occurrences, [{ scope: "model" }]);
  assert.deepEqual(parsed.receipt.warnings[2].occurrences, [{ scope: "recovery" }]);
  assert.equal(parsed.receipt.warnings.some((warning) => warning.raw === "ownerless_only"), false);
  assert.ok(parsed.warnings.includes("capture_metadata_warning"));
});

test("receipt download is unavailable until a compatible receipt exists", async () => {
  const unavailable = createReceiptResponse(null, "pending-id");
  assert.equal(unavailable.status, 409);
  assert.deepEqual(await unavailable.json(), { error: "The recovery receipt is not available yet." });
  assert.equal(unavailable.headers.get("x-content-type-options"), "nosniff");

  const receiptCapture = { ...capture, warnings: ["capture_metadata_warning"] };
  const parsed = parsePersistedRecoveryResult(JSON.stringify(legacyResult(
    ["capture_metadata_warning", "model_fallback:timeout"],
    [receiptCapture],
    [{
      id: "page-home",
      sourceId: receiptCapture.sourceId,
      capture: receiptCapture,
      blocks: [],
      warnings: ["block_limit_reached"],
    }],
  )));
  assert.ok(parsed);
  const available = createReceiptResponse(parsed as RecoveryResult, "legacy/id");
  assert.equal(available.status, 200);
  assert.match(available.headers.get("content-disposition") || "", /legacyid-receipt\.json/);
  const body = await available.text();
  const receipt = JSON.parse(body);
  assert.equal(receipt.captures[0].archiveUrl, receiptCapture.archiveUrl);
  assert.equal(receipt.captures[0].capturedAt, receiptCapture.capturedAt);
  assert.deepEqual(receipt.warnings.map((warning: { raw: string }) => warning.raw), [
    "capture_metadata_warning",
    "block_limit_reached",
    "model_fallback:timeout",
  ]);
  assert.equal(receipt.warnings[1].occurrences[0].sourceId, receiptCapture.sourceId);
});
