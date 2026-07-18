import assert from "node:assert/strict";
import test from "node:test";
import { discoverCaptures, fetchCaptureHtml, RequestedEraUnavailableError } from "../lib/archive";
import type { Capture, RecoveryResult } from "../lib/domain";
import { hydrateRecoveryRecord, parsePersistedRecoveryResult } from "../lib/recovery-compat";
import { createReceiptResponse } from "../lib/receipt-response";

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

function legacyResult() {
  return {
    id: "legacy-id",
    normalizedUrl: "http://lostsite.org/",
    sources: [],
    captures: [],
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

test("legacy additive fields are normalized and corrupt durable JSON becomes unavailable", () => {
  assert.equal(parsePersistedRecoveryResult("not-json"), null);
  assert.equal(parsePersistedRecoveryResult(JSON.stringify({ id: "stale" })), null);

  const parsed = parsePersistedRecoveryResult(JSON.stringify(legacyResult()));
  assert.ok(parsed);
  assert.deepEqual(parsed.nodes, []);
  assert.deepEqual(parsed.edges, []);
  assert.deepEqual(parsed.temporalCandidates, []);
  assert.deepEqual(parsed.receipt.decisions, []);
  assert.deepEqual(parsed.receipt.validationResults, []);
  assert.deepEqual(parsed.manifest.pages[0].supportingSourceIds, ["source-supporting"]);

  const hydrated = hydrateRecoveryRecord({
    id: "legacy-id",
    status: "complete",
    resultJson: JSON.stringify(legacyResult()),
  });
  assert.equal("resultJson" in hydrated, false);
  assert.equal(hydrated.result?.id, "legacy-id");
});

test("receipt download is unavailable until a compatible receipt exists", async () => {
  const unavailable = createReceiptResponse(null, "pending-id");
  assert.equal(unavailable.status, 409);
  assert.deepEqual(await unavailable.json(), { error: "The recovery receipt is not available yet." });
  assert.equal(unavailable.headers.get("x-content-type-options"), "nosniff");

  const parsed = parsePersistedRecoveryResult(JSON.stringify(legacyResult()));
  assert.ok(parsed);
  const available = createReceiptResponse(parsed as RecoveryResult, "legacy/id");
  assert.equal(available.status, 200);
  assert.match(available.headers.get("content-disposition") || "", /legacyid-receipt\.json/);
  const body = await available.text();
  assert.doesNotThrow(() => JSON.parse(body));
});
