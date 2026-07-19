import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { discoverCaptures, fetchCaptureHtml, rankTemporalWindows, RequestedEraUnavailableError } from "../lib/archive";
import type { Capture, RecoveryResult } from "../lib/domain";
import { hydrateRecoveryRecord, parsePersistedRecoveryResult } from "../lib/recovery-compat";
import { createReceiptResponse } from "../lib/receipt-response";
import { aggregateRecoveryWarnings, buildReceiptWarnings, modelFallbackWarning } from "../lib/recovery-warnings";
import { stableStringify } from "../lib/hash";
import { isHtmlMediaType, isJsonMediaType } from "../lib/media-type";
import { readBoundedRequestBody } from "../lib/request-body";

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

test("capture retrieval rejects unsafe responses and disposes every unread body", async () => {
  let nonHtmlCancelled = false;
  await withMockFetch(async () => new Response(new ReadableStream({
    cancel() {
      nonHtmlCancelled = true;
    },
  }), {
    headers: { "content-type": "text/plain" },
  }), async () => {
    await assert.rejects(() => fetchCaptureHtml(capture), /was not HTML/);
  });
  assert.equal(nonHtmlCancelled, true);

  let declaredOversizeCancelled = false;
  await withMockFetch(async () => new Response(new ReadableStream({
    cancel() {
      declaredOversizeCancelled = true;
    },
  }), {
    headers: { "content-type": "text/html", "content-length": "2500001" },
  }), async () => {
    await assert.rejects(() => fetchCaptureHtml(capture), /exceeded the response budget/);
  });
  assert.equal(declaredOversizeCancelled, true);

  let streamedOversizeCancelled = false;
  await withMockFetch(async () => new Response(new ReadableStream({
    pull(controller) {
      controller.enqueue(new Uint8Array(2_500_001));
    },
    cancel() {
      streamedOversizeCancelled = true;
    },
  }), {
    headers: { "content-type": "text/html" },
  }), async () => {
    await assert.rejects(() => fetchCaptureHtml(capture), /exceeded the response budget/);
  });
  assert.equal(streamedOversizeCancelled, true);

  let calls = 0;
  let rejectedRedirectCancelled = false;
  await withMockFetch(async () => {
    calls += 1;
    return new Response(new ReadableStream({
      cancel() {
        rejectedRedirectCancelled = true;
      },
    }), { status: 302, headers: { location: "https://evil.example/capture" } });
  }, async () => {
    await assert.rejects(() => fetchCaptureHtml(capture), /leave the allowlist/);
  });
  assert.equal(calls, 1);
  assert.equal(rejectedRedirectCancelled, true);
});

test("request bodies stop at the byte budget and exact media types reject look-alikes", async () => {
  let pulls = 0;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls += 1;
      if (pulls === 1) controller.enqueue(new Uint8Array(4_090));
      else if (pulls === 2) controller.enqueue(new Uint8Array(7));
      else throw new Error("the bounded reader pulled beyond the rejecting chunk");
    },
    cancel() {
      cancelled = true;
    },
  });
  const request = new Request("https://alexandria.invalid/api/recover", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });

  await assert.rejects(() => readBoundedRequestBody(request, 4_096), /too large/);
  assert.equal(pulls, 2);
  assert.equal(cancelled, true);

  let declaredOversizePulls = 0;
  let declaredOversizeCancelled = false;
  const declaredOversize = new Request("https://alexandria.invalid/api/recover", {
    method: "POST",
    headers: { "content-length": "4097", "content-type": "application/json" },
    body: new ReadableStream<Uint8Array>({
      pull(controller) {
        declaredOversizePulls += 1;
        controller.enqueue(new Uint8Array(1));
      },
      cancel() {
        declaredOversizeCancelled = true;
      },
    }),
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  const pullsBeforeDeclaredCheck = declaredOversizePulls;
  await assert.rejects(() => readBoundedRequestBody(declaredOversize, 4_096), /too large/);
  assert.equal(declaredOversizePulls, pullsBeforeDeclaredCheck);
  assert.equal(declaredOversizeCancelled, true);

  assert.equal(isJsonMediaType("application/json; charset=utf-8"), true);
  assert.equal(isJsonMediaType("application/problem+json"), true);
  assert.equal(isJsonMediaType("application/not-json"), false);
  assert.equal(isJsonMediaType("application/jsonp"), false);
  assert.equal(isHtmlMediaType("text/html; charset=utf-8"), true);
  assert.equal(isHtmlMediaType("application/xhtml+xml"), true);
  assert.equal(isHtmlMediaType("application/nothtml"), false);
  assert.equal(isHtmlMediaType("text/htmlish"), false);
});

test("archive MIME boundaries reject JSON and HTML look-alikes", async () => {
  await withMockFetch(
    async () => new Response("<p>not html</p>", { headers: { "content-type": "application/nothtml" } }),
    async () => assert.rejects(() => fetchCaptureHtml(capture), /was not HTML/),
  );

  await withMockFetch(
    async () => new Response("[]", { headers: { "content-type": "application/not-json" } }),
    async () => assert.rejects(() => discoverCaptures("http://lostsite.org/"), /was not JSON/),
  );
});

test("capture retrieval follows an exact replay redirect and cancels its body before the next hop", async () => {
  let calls = 0;
  let redirectCancelled = false;
  await withMockFetch(async () => {
    calls += 1;
    if (calls === 1) {
      return new Response(new ReadableStream({
        cancel() {
          redirectCancelled = true;
        },
      }), {
        status: 302,
        headers: {
          location: "/web/20030401000000id_/http://lostsite.org/",
        },
      });
    }
    assert.equal(redirectCancelled, true);
    return new Response("preserved", { headers: { "content-type": "text/html" } });
  }, async () => {
    assert.equal(await fetchCaptureHtml(capture), "preserved");
  });
  assert.equal(calls, 2);
});

test("capture retrieval rejects identity-changing replay redirects and disposes their bodies", async () => {
  for (const location of [
    "https://web.archive.org/web/20030402000000id_/http://lostsite.org/",
    "https://web.archive.org/web/20030401000000id_/http://lostsite.org/home.html",
    "https://web.archive.org/web/20030401000000im_/http://lostsite.org/",
  ]) {
    let calls = 0;
    let redirectCancelled = false;
    await withMockFetch(async () => {
      calls += 1;
      return new Response(new ReadableStream({
        cancel() {
          redirectCancelled = true;
        },
      }), { status: 302, headers: { location } });
    }, async () => {
      await assert.rejects(() => fetchCaptureHtml(capture), /replay changed identity/);
    });
    assert.equal(calls, 1);
    assert.equal(redirectCancelled, true);
  }
});

test("capture retrieval keeps its timeout active while the response body is stalled", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let responseReady!: () => void;
  const headersReturned = new Promise<void>((resolve) => {
    responseReady = resolve;
  });
  let requestSignal: AbortSignal | undefined;
  let bodyController: ReadableStreamDefaultController<Uint8Array> | undefined;

  try {
    await withMockFetch(async (_input, init) => {
      requestSignal = init?.signal || undefined;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          bodyController = controller;
        },
      });
      requestSignal?.addEventListener("abort", () => {
        bodyController?.error(requestSignal?.reason);
      }, { once: true });
      responseReady();
      return new Response(body, { headers: { "content-type": "text/html" } });
    }, async () => {
      const pending = fetchCaptureHtml(capture);
      await headersReturned;
      await new Promise<void>((resolve) => setImmediate(resolve));
      context.mock.timers.tick(12_000);
      const timedOut = requestSignal?.aborted === true;
      if (!timedOut) bodyController?.error(new Error("test cleanup: capture timeout was inactive"));
      await assert.rejects(pending, /Archive request timed out/);
      assert.equal(timedOut, true);
    });
  } finally {
    context.mock.timers.reset();
  }
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

test("archive inventory tolerates one protocol failure and rejects malformed JSON with bounded language", async () => {
  const rows = [
    ["timestamp", "original", "statuscode", "mimetype", "digest"],
    ["20030401000000", "http://lostsite.org/", "200", "text/html", "home"],
  ];
  await withMockFetch(async (input) => {
    const original = new URL(new URL(String(input)).searchParams.get("url")!);
    return original.protocol === "http:"
      ? Response.json(rows)
      : new Response("", { headers: { "content-type": "application/json" } });
  }, async () => {
    const inventory = await discoverCaptures("http://lostsite.org/");
    assert.equal(inventory.selected.length, 1);
    assert.deepEqual(inventory.warnings, ["archive_inventory_partial"]);
  });

  await withMockFetch(
    async () => new Response("", { headers: { "content-type": "application/json" } }),
    async () => {
      await assert.rejects(
        () => discoverCaptures("http://lostsite.org/"),
        /Archive inventory returned incomplete or invalid JSON/,
      );
    },
  );
});

function legacyResult(warnings: string[] = [], captures: Capture[] = [], sources: unknown[] = []) {
  const effectiveCaptures = captures.length ? captures : [capture];
  const effectiveSources = sources.length ? sources : [legacySource(effectiveCaptures[0])];
  const sourceIds = effectiveSources.flatMap((source) => {
    if (!source || typeof source !== "object" || !("sourceId" in source) || typeof source.sourceId !== "string") return [];
    return [source.sourceId];
  });
  const primarySourceId = sourceIds[0];
  const temporalSelection = rankTemporalWindows(effectiveCaptures)[0].score;
  const sourceHashes = effectiveSources.flatMap((source) => {
    if (!source || typeof source !== "object" || !("blocks" in source) || !Array.isArray(source.blocks)) return [];
    return source.blocks.flatMap((block) => {
      if (!block || typeof block !== "object" || !("id" in block) || !("contentHash" in block)
        || typeof block.id !== "string" || typeof block.contentHash !== "string") return [];
      return [{ blockId: block.id, hash: block.contentHash }];
    });
  });
  const result = {
    id: "legacy-id",
    submittedUrl: "http://lostsite.org/",
    normalizedUrl: "http://lostsite.org/",
    createdAt: "2003-04-02T00:00:00.000Z",
    outcome: "restored",
    sources: effectiveSources,
    captures: effectiveCaptures,
    warnings,
    manifest: {
      schemaVersion: "2.0",
      outcome: "restored",
      originalUrl: "http://lostsite.org/",
      recoveredTitle: "Lost Site",
      selectedWindowStart: "2003-04-01T00:00:00.000Z",
      selectedWindowEnd: "2003-04-02T00:00:00.000Z",
      selectedEraLabel: "Recovered from a coherent window between Apr 1, 2003 and Apr 2, 2003",
      pages: [{
        id: "page-home",
        path: "/",
        title: "Lost Site",
        status: "reconstructed_from_sources",
        sourceIds,
        primarySourceId,
        blockIds: [],
      }],
      navigation: [{ pageId: "page-home", label: "Lost Site", sourceIds: [primarySourceId] }],
      notes: [],
    },
    receipt: {
      receiptVersion: "1.0",
      recoveryId: "legacy-id",
      manifestHash: "a".repeat(64),
      sourceHashes,
      model: null,
      promptVersion: null,
      modelSchemaVersion: "temporal-restoration-plan-v2",
      planner: "deterministic",
      selectedWindowStart: "2003-04-01T00:00:00.000Z",
      selectedWindowEnd: "2003-04-02T00:00:00.000Z",
      temporalSelection,
      counts: { preservedBlocks: 0, renderedBlocks: 0, inferredEdges: 0, knownAbsences: 0 },
      generatedAt: "2003-04-02T00:00:00.000Z",
    },
  };
  result.receipt.manifestHash = createHash("sha256").update(stableStringify(result.manifest)).digest("hex");
  return result;
}

function legacySource(ownerCapture: Capture, warnings: string[] = []) {
  const titleBlockId = `title-${ownerCapture.id}`;
  return {
    id: `page-${ownerCapture.id}`,
    sourceId: ownerCapture.sourceId,
    capture: ownerCapture,
    canonicalPath: new URL(ownerCapture.originalUrl).pathname || "/",
    title: "Lost Site",
    titleBlockId,
    blocks: [{
      id: titleBlockId,
      sourceId: ownerCapture.sourceId,
      captureId: ownerCapture.id,
      kind: "title",
      exactText: "Lost Site",
      contentHash: "20f263bfee8687502b17996f2a9565e2bb3a2aec86884b891502fa5711a288c1",
      position: 0,
      originalUrl: ownerCapture.originalUrl,
      archiveUrl: ownerCapture.archiveUrl,
      capturedAt: ownerCapture.capturedAt,
      warnings: [],
    }],
    internalLinks: [],
    warnings,
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

test("legacy additive fields are normalized and corrupt durable JSON becomes unavailable", async () => {
  assert.equal(await parsePersistedRecoveryResult("not-json"), null);
  assert.equal(await parsePersistedRecoveryResult(JSON.stringify({ id: "stale" })), null);

  const receiptCapture = { ...capture, warnings: ["capture_metadata_warning"] };
  const parsed = await parsePersistedRecoveryResult(JSON.stringify(legacyResult(
    ["capture_metadata_warning", "model_fallback:timeout"],
    [receiptCapture],
    [legacySource(receiptCapture, ["block_limit_reached"])],
  )));
  assert.ok(parsed);
  assert.deepEqual(parsed.nodes, []);
  assert.deepEqual(parsed.edges, []);
  assert.deepEqual(parsed.temporalCandidates, []);
  assert.deepEqual(parsed.receipt.decisions, []);
  assert.deepEqual(parsed.receipt.validationResults, []);
  assert.deepEqual(parsed.manifest.pages[0].supportingSourceIds, []);

  const normalizedWarnings = await parsePersistedRecoveryResult(JSON.stringify(legacyResult([
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
    legacySource(warnedCaptureA, ["block_limit_reached"]),
    legacySource(warnedCaptureB, ["block_limit_reached"]),
  ];
  const warnedLegacy = await parsePersistedRecoveryResult(JSON.stringify(legacyResult([
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

  const hydrated = await hydrateRecoveryRecord({
    id: "legacy-id",
    normalizedUrl: "http://lostsite.org/",
    status: "complete",
    resultJson: JSON.stringify(legacyResult()),
  });
  assert.equal("resultJson" in hydrated, false);
  assert.equal(hydrated.result?.id, "legacy-id");
});

test("pre-1.3 query-bearing receipts keep their persisted pathname-only identity", async () => {
  const queryCapture: Capture = {
    ...capture,
    originalUrl: "http://lostsite.org/?page=16&qq=index.php",
    archiveUrl: "https://web.archive.org/web/20030401000000id_/http://lostsite.org/?page=16&qq=index.php",
  };
  const parsed = await parsePersistedRecoveryResult(JSON.stringify(legacyResult(
    [],
    [queryCapture],
    [legacySource(queryCapture)],
  )));
  assert.ok(parsed);
  assert.equal(parsed.sources[0].canonicalPath, "/");
  assert.equal(parsed.manifest.pages[0].path, "/");
});

test("durable compatibility rejects nested corruption and cross-row identity drift", async () => {
  const valid = legacyResult();
  assert.ok(await parsePersistedRecoveryResult(JSON.stringify(valid)));

  const corrupted = [
    { ...valid, manifest: { ...valid.manifest, pages: [null] } },
    { ...valid, manifest: { ...valid.manifest, pages: [{ ...valid.manifest.pages[0], sourceIds: "source-primary" }] } },
    { ...valid, receipt: { ...valid.receipt, sourceHashes: [null] } },
    { ...valid, receipt: { ...valid.receipt, counts: { ...valid.receipt.counts, renderedBlocks: "0" } } },
    { ...valid, receipt: { ...valid.receipt, decisions: [null] } },
    { ...valid, receipt: { ...valid.receipt, validationResults: [{ rule: "shape", passed: "yes", detail: "forged" }] } },
    { ...valid, temporalCandidates: [null] },
    { ...valid, receipt: { ...valid.receipt, recoveryId: "other-recovery" } },
    { ...valid, outcome: "insufficient_evidence" },
    { ...valid, receipt: { ...valid.receipt, selectedWindowEnd: "2004-01-01T00:00:00.000Z" } },
  ];
  for (const candidate of corrupted) {
    assert.equal(await parsePersistedRecoveryResult(JSON.stringify(candidate)), null);
  }

  const mismatchedResult = structuredClone(valid);
  mismatchedResult.id = "result-b";
  mismatchedResult.receipt.recoveryId = "result-b";
  assert.equal((await hydrateRecoveryRecord({
    id: "row-a",
    normalizedUrl: valid.normalizedUrl,
    resultJson: JSON.stringify(mismatchedResult),
  })).result, null);
  assert.equal((await hydrateRecoveryRecord({
    id: valid.id,
    normalizedUrl: "http://other.example/",
    resultJson: JSON.stringify(valid),
  })).result, null);
});

test("partial receipt metadata fails soft by merging valid persisted capture and warning owners", async () => {
  const captureA = { ...capture, id: "capture-a", sourceId: "source-a", warnings: [] };
  const captureB = {
    ...capture,
    id: "capture-b",
    sourceId: "source-b",
    archiveUrl: "https://web.archive.org/web/20030402000000id_/http://lostsite.org/",
    timestamp: "20030402000000",
    capturedAt: "2003-04-02T00:00:00.000Z",
    warnings: ["capture_metadata_warning"],
  };
  const sources = [
    legacySource(captureA, ["block_limit_reached"]),
    legacySource(captureB, ["block_limit_reached"]),
  ];
  const base = legacyResult(
    ["block_limit_reached", "model_fallback:provider_timeout", "unknown_warning"],
    [captureA, captureB],
    sources,
  );
  const parsed = await parsePersistedRecoveryResult(JSON.stringify({
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
  const parsed = await parsePersistedRecoveryResult(JSON.stringify(legacyResult(
    ["capture_metadata_warning", "model_fallback:timeout"],
    [receiptCapture],
    [legacySource(receiptCapture, ["block_limit_reached"])],
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
