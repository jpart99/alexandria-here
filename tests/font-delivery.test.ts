import assert from "node:assert/strict";
import test from "node:test";

import {
  FONT_ASSET_PATHS,
  FONT_CACHE_CONTROL,
  FONT_PUBLIC_PATHS,
  FONT_ROUTES,
  FONT_WORKER_ROUTE_MARKER,
  decorateFontAssetResponse,
  fetchFontAsset,
  fontAssetRequest,
  isFontAssetRequest,
} from "../lib/font-delivery";

test("font routing accepts only GET and HEAD on the two public aliases", () => {
  for (const path of FONT_PUBLIC_PATHS) {
    assert.equal(isFontAssetRequest(new Request(`https://alexandria.example${path}`)), true);
    assert.equal(isFontAssetRequest(new Request(`https://alexandria.example${path}`, { method: "HEAD" })), true);
    assert.equal(isFontAssetRequest(new Request(`https://alexandria.example${path}?v=1`)), true);
    assert.equal(isFontAssetRequest(new Request(`https://alexandria.example${path}`, { method: "POST" })), false);
  }
  for (const path of FONT_ASSET_PATHS) {
    assert.equal(isFontAssetRequest(new Request(`https://alexandria.example${path}`)), false);
  }
  assert.equal(isFontAssetRequest(new Request("https://alexandria.example/witness-fonts/missing.woff2")), false);
  assert.equal(isFontAssetRequest(new Request("https://alexandria.example/witness-fonts/Geist-latin.woff2")), false);
  assert.equal(isFontAssetRequest(new Request(`${String(new URL(`https://alexandria.example${FONT_PUBLIC_PATHS[0]}`))}/`)), false);
  assert.equal(isFontAssetRequest(new Request("https://alexandria.example/witness-fonts/%67eist-latin.woff2")), false);
  assert.equal(isFontAssetRequest(new Request("https://alexandria.example/assets/geist-latin.woff2")), false);
});

test("font delivery rewrites only the path and preserves ranged asset semantics", async () => {
  const request = new Request(`https://alexandria.example${FONT_PUBLIC_PATHS[0]}?v=1`, {
    headers: {
      Range: "bytes=0-3",
      "If-None-Match": '"font-etag"',
      "If-Range": '"range-etag"',
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

  assert.notEqual(received, request);
  assert.equal(request.url, `https://alexandria.example${FONT_PUBLIC_PATHS[0]}?v=1`);
  assert.equal(received?.url, `https://alexandria.example${FONT_ASSET_PATHS[0]}?v=1`);
  assert.equal(received?.method, "GET");
  assert.equal(received?.headers.get("range"), "bytes=0-3");
  assert.equal(received?.headers.get("if-none-match"), '"font-etag"');
  assert.equal(received?.headers.get("if-range"), '"range-etag"');
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

test("each public font alias maps to exactly one same-origin physical asset", () => {
  assert.equal(FONT_ROUTES.length, 2);
  assert.equal(new Set(FONT_PUBLIC_PATHS).size, FONT_ROUTES.length);
  assert.equal(new Set(FONT_ASSET_PATHS).size, FONT_ROUTES.length);
  for (const [index, route] of FONT_ROUTES.entries()) {
    const controller = new AbortController();
    const request = new Request(`https://alexandria.example${route.publicPath}`, {
      method: "HEAD",
      redirect: "manual",
      signal: controller.signal,
    });
    const mapped = fontAssetRequest(request);
    assert.equal(mapped?.url, `https://alexandria.example${route.assetPath}`);
    assert.equal(mapped?.method, "HEAD");
    assert.equal(mapped?.redirect, "manual");
    assert.equal(mapped?.signal.aborted, false);
    controller.abort();
    assert.equal(mapped?.signal.aborted, true);
    assert.equal(FONT_PUBLIC_PATHS[index], route.publicPath);
    assert.equal(FONT_ASSET_PATHS[index], route.assetPath);
  }
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

  for (const errorResponse of [missing, unsatisfiable]) {
    const routed = await fetchFontAsset(
      new Request(`https://alexandria.example${FONT_PUBLIC_PATHS[0]}`),
      { async fetch() { return errorResponse; } },
    );
    assert.equal(routed, errorResponse);
    assert.equal(routed?.headers.get("x-alexandria-asset-route"), null);
  }

  let fetchCount = 0;
  const assets = {
    async fetch() {
      fetchCount += 1;
      return new Response("unexpected");
    },
  };
  const post = new Request(`https://alexandria.example${FONT_PUBLIC_PATHS[0]}`, { method: "POST" });
  const unknown = new Request("https://alexandria.example/witness-fonts/missing.woff2");
  const physical = new Request(`https://alexandria.example${FONT_ASSET_PATHS[0]}`);
  assert.equal(await fetchFontAsset(post, assets), null);
  assert.equal(await fetchFontAsset(unknown, assets), null);
  assert.equal(await fetchFontAsset(physical, assets), null);
  assert.equal(fetchCount, 0);

  const fetchFailure = new Error("asset binding unavailable");
  await assert.rejects(
    fetchFontAsset(new Request(`https://alexandria.example${FONT_PUBLIC_PATHS[0]}`), {
      async fetch(input) {
        assert.equal(input.url, `https://alexandria.example${FONT_ASSET_PATHS[0]}`);
        throw fetchFailure;
      },
    }),
    (error) => error === fetchFailure,
  );
});
