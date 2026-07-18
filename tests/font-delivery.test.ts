import assert from "node:assert/strict";
import test from "node:test";

import {
  FONT_ASSET_PATHS,
  FONT_CACHE_CONTROL,
  FONT_WORKER_ROUTE_MARKER,
  decorateFontAssetResponse,
  fetchFontAsset,
  isFontAssetRequest,
} from "../lib/font-delivery";

test("font routing accepts only GET and HEAD on the two shipped paths", () => {
  for (const path of FONT_ASSET_PATHS) {
    assert.equal(isFontAssetRequest(new Request(`https://alexandria.example${path}`)), true);
    assert.equal(isFontAssetRequest(new Request(`https://alexandria.example${path}`, { method: "HEAD" })), true);
    assert.equal(isFontAssetRequest(new Request(`https://alexandria.example${path}?v=1`)), true);
    assert.equal(isFontAssetRequest(new Request(`https://alexandria.example${path}`, { method: "POST" })), false);
  }
  assert.equal(isFontAssetRequest(new Request("https://alexandria.example/fonts/missing.woff2")), false);
  assert.equal(isFontAssetRequest(new Request("https://alexandria.example/assets/geist-latin.woff2")), false);
});

test("font delivery forwards the original ranged request and preserves asset semantics", async () => {
  const request = new Request(`https://alexandria.example${FONT_ASSET_PATHS[0]}`, {
    headers: {
      Range: "bytes=0-3",
      "If-None-Match": '"font-etag"',
    },
  });
  let received: Request | undefined;
  const response = await fetchFontAsset(request, {
    async fetch(input) {
      received = input;
      return new Response("wOF2", {
        status: 206,
        statusText: "Partial Content",
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Range": "bytes 0-3/29288",
          "Accept-Ranges": "bytes",
          ETag: '"font-etag"',
        },
      });
    },
  });

  assert.equal(received, request);
  assert.equal(received?.headers.get("range"), "bytes=0-3");
  assert.equal(received?.headers.get("if-none-match"), '"font-etag"');
  assert.equal(response?.status, 206);
  assert.equal(await response?.text(), "wOF2");
  assert.equal(response?.headers.get("content-range"), "bytes 0-3/29288");
  assert.equal(response?.headers.get("accept-ranges"), "bytes");
  assert.equal(response?.headers.get("etag"), '"font-etag"');
  assert.equal(response?.headers.get("content-type"), "font/woff2");
  assert.equal(response?.headers.get("cache-control"), FONT_CACHE_CONTROL);
  assert.equal(response?.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response?.headers.get("x-alexandria-asset-route"), FONT_WORKER_ROUTE_MARKER);
});

test("HEAD and conditional font responses retain empty bodies and validators", async () => {
  const head = decorateFontAssetResponse(new Response(null, {
    status: 200,
    headers: { ETag: '"head-etag"', "Content-Length": "29288" },
  }));
  assert.equal(head.body, null);
  assert.equal(head.headers.get("content-length"), "29288");
  assert.equal(head.headers.get("content-type"), "font/woff2");

  const notModified = decorateFontAssetResponse(new Response(null, {
    status: 304,
    headers: { ETag: '"head-etag"' },
  }));
  assert.equal(notModified.body, null);
  assert.equal(notModified.status, 304);
  assert.equal(notModified.headers.get("etag"), '"head-etag"');
  assert.equal(notModified.headers.get("x-alexandria-asset-route"), FONT_WORKER_ROUTE_MARKER);
});

test("errors, unsupported methods, and unknown fonts are not relabeled", async () => {
  const missing = new Response("missing", {
    status: 404,
    headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
  });
  assert.equal(decorateFontAssetResponse(missing), missing);
  assert.equal(missing.headers.get("content-type"), "text/plain");
  assert.equal(missing.headers.get("x-alexandria-asset-route"), null);

  const unsatisfiable = new Response("range error", {
    status: 416,
    headers: {
      "Content-Type": "text/plain",
      "Cache-Control": "no-store",
      "Content-Range": "bytes */29288",
    },
  });
  assert.equal(decorateFontAssetResponse(unsatisfiable), unsatisfiable);
  assert.equal(unsatisfiable.status, 416);
  assert.equal(unsatisfiable.headers.get("content-range"), "bytes */29288");
  assert.equal(unsatisfiable.headers.get("content-type"), "text/plain");
  assert.equal(unsatisfiable.headers.get("cache-control"), "no-store");
  assert.equal(unsatisfiable.headers.get("x-alexandria-asset-route"), null);

  let fetchCount = 0;
  const assets = {
    async fetch() {
      fetchCount += 1;
      return new Response("unexpected");
    },
  };
  const post = new Request(`https://alexandria.example${FONT_ASSET_PATHS[0]}`, { method: "POST" });
  const unknown = new Request("https://alexandria.example/fonts/missing.woff2");
  assert.equal(await fetchFontAsset(post, assets), null);
  assert.equal(await fetchFontAsset(unknown, assets), null);
  assert.equal(fetchCount, 0);

  const fetchFailure = new Error("asset binding unavailable");
  await assert.rejects(
    fetchFontAsset(new Request(`https://alexandria.example${FONT_ASSET_PATHS[0]}`), {
      async fetch(input) {
        assert.equal(input.url, `https://alexandria.example${FONT_ASSET_PATHS[0]}`);
        throw fetchFailure;
      },
    }),
    (error) => error === fetchFailure,
  );
});
