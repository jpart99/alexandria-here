import { lookup } from "node:dns/promises";
import { readFile } from "node:fs/promises";
import { isIP } from "node:net";
import path from "node:path";

import { auditBrowserFontReferences } from "./font-browser-contract.mjs";
import { assertExactReferenceProof } from "./submission-proof-contract.mjs";

const rawBaseUrl = process.env.ALEXANDRIA_BASE_URL;
if (!rawBaseUrl) throw new Error("Set ALEXANDRIA_BASE_URL to the deployed HTTPS origin.");

const baseUrl = new URL(rawBaseUrl);
const hostname = baseUrl.hostname.replace(/^\[|\]$/gu, "").replace(/\.$/u, "").toLowerCase();
const expectedProductionHostname = "alexandria-here.cinemaexile.chatgpt.site";
const reservedNames = /(?:^|\.)(?:localhost|local|internal|lan|test|invalid|example|onion)$|(?:^|\.)home\.arpa$/iu;

function isNonPublicIpv4(address) {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return true;
  const [a, b, c] = octets;
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0 && c === 0)
    || (a === 192 && b === 0 && c === 2)
    || (a === 192 && b === 88 && c === 99)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113)
    || a >= 224;
}

function isNonPublicIp(address) {
  const normalized = address.replace(/^\[|\]$/gu, "").toLowerCase();
  const version = isIP(normalized);
  if (version === 4) return isNonPublicIpv4(normalized);
  if (version !== 6) return true;
  if (normalized.startsWith("::")) return true;
  if (/^(?:f[cd]|fe[89a-f]|ff)/u.test(normalized)) return true;
  if (/^2001:(?:db8|1[0-9a-f])(?::|$)/u.test(normalized)) return true;
  if (/^2001:2(?::|$)/u.test(normalized)) return true;
  if (/^64:ff9b:1(?::|$)/u.test(normalized)) return true;
  return false;
}

if (baseUrl.protocol !== "https:"
  || (baseUrl.port && baseUrl.port !== "443")
  || baseUrl.username
  || baseUrl.password
  || !hostname
  || hostname !== expectedProductionHostname
  || reservedNames.test(hostname)
  || (isIP(hostname) === 0 && !hostname.includes("."))) {
  throw new Error(`Production smoke requires https://${expectedProductionHostname} on port 443 without credentials.`);
}
const resolvedAddresses = isIP(hostname)
  ? [hostname]
  : (await lookup(hostname, { all: true, verbatim: true })).map((record) => record.address);
if (resolvedAddresses.length === 0 || resolvedAddresses.some(isNonPublicIp)) {
  throw new Error("Production smoke refused a non-public target address.");
}
baseUrl.pathname = "/";
baseUrl.search = "";
baseUrl.hash = "";

const root = process.cwd();
const marker = "worker-font-alias-v2";
const applicationWorkerMarker = "app-worker-v1";
const cacheControl = "public, max-age=86400";
const fontNames = ["geist-latin.woff2", "cormorant-garamond-latin.woff2"];
const fontRoutes = fontNames.map((name) => ({ publicPath: `/witness-fonts/${name}` }));
const requireExactReferenceProof = process.env.ALEXANDRIA_REQUIRE_EXACT_REFERENCE_PROOF === "1";
const checks = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(relative, init = {}) {
  return fetch(new URL(relative, baseUrl), {
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
    ...init,
  });
}

async function readBounded(response, maximumBytes) {
  if (!response.body) return Buffer.alloc(0);
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    await response.body.cancel("production smoke response exceeds its declared limit");
    throw new Error(`Response declared ${declaredLength} bytes; limit is ${maximumBytes}.`);
  }
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximumBytes) {
        await reader.cancel("production smoke response exceeds its streamed limit");
        throw new Error(`Response exceeded the ${maximumBytes}-byte streamed limit.`);
      }
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    await reader.cancel("production smoke read failed").catch(() => undefined);
    throw error;
  }
  return Buffer.concat(chunks, length);
}

function responseHasFontHeaders(response, { contentType = true } = {}) {
  return (!contentType || /^font\/woff2(?:;|$)/iu.test(response.headers.get("content-type") || ""))
    && response.headers.get("cache-control") === cacheControl
    && response.headers.get("x-content-type-options") === "nosniff"
    && response.headers.get("x-alexandria-asset-route") === marker
    && response.headers.get("x-alexandria-worker-route") === applicationWorkerMarker;
}

const landing = await request("/");
const landingHtml = (await readBounded(landing, 1_000_000)).toString("utf8");
assert(landing.status === 200 && landingHtml.length > 1_000, `Landing failed: HTTP ${landing.status}.`);
checks.push(["landing", landing.status]);

const stylesheetUrls = [];
const stylesheetBodies = [];
for (const [tag] of landingHtml.matchAll(/<link\b[^>]*>/giu)) {
  const rel = tag.match(/\brel=["']([^"']*)["']/iu)?.[1] || "";
  if (!rel.split(/\s+/u).some((token) => token.toLowerCase() === "stylesheet")) continue;
  const href = tag.match(/\bhref=["']([^"']+)["']/iu)?.[1];
  assert(href, "A stylesheet link omitted href.");
  const stylesheetUrl = new URL(href, baseUrl);
  assert(stylesheetUrl.origin === baseUrl.origin, `Cross-origin stylesheet refused: ${stylesheetUrl.origin}.`);
  stylesheetUrls.push(`${stylesheetUrl.pathname}${stylesheetUrl.search}`);
}
assert(stylesheetUrls.length > 0, "Landing exposed no same-origin stylesheet.");
for (const stylesheetUrl of new Set(stylesheetUrls)) {
  const stylesheet = await request(stylesheetUrl, { headers: { "Cache-Control": "no-cache" } });
  const stylesheetBytes = await readBounded(stylesheet, 2_000_000);
  const stylesheetBody = stylesheetBytes.toString("utf8");
  assert(stylesheet.status === 200 && stylesheetBytes.length > 0, `Stylesheet failed: HTTP ${stylesheet.status}.`);
  assert(/^text\/css(?:;|$)/iu.test(stylesheet.headers.get("content-type") || ""), "Stylesheet MIME is unsafe.");
  assert(stylesheet.headers.get("x-alexandria-asset-route") === null, "Ordinary assets entered the font Worker route.");
  assert(stylesheet.headers.get("x-alexandria-worker-route") === null, "Ordinary assets entered the application Worker.");
  stylesheetBodies.push({ url: new URL(stylesheetUrl, baseUrl), css: stylesheetBody });
  checks.push([`ordinary asset remains direct: ${stylesheetUrl}`, stylesheet.status]);
}

const inlineStyles = [...landingHtml.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/giu)].map((match, index) => ({
  url: new URL(`/?inline-style=${index + 1}`, baseUrl),
  css: match[1],
}));
const styleAttributes = [...landingHtml.matchAll(/\bstyle=["']([^"']*)["']/giu)].map((match, index) => ({
  url: new URL(`/?style-attribute=${index + 1}`, baseUrl),
  css: `.inline-style { ${match[1]} }`,
}));
const fontReferenceAudit = auditBrowserFontReferences({
  baseUrl,
  landingHtml,
  linkHeader: landing.headers.get("link") || "",
  stylesheets: [...stylesheetBodies, ...inlineStyles, ...styleAttributes],
  allowedPublicPaths: fontRoutes.map(({ publicPath }) => publicPath),
});
assert(fontReferenceAudit.errors.length === 0, `Browser font contract failed: ${fontReferenceAudit.errors.join(" ")}`);
checks.push(["browser font references use only Worker aliases", fontRoutes.map(({ publicPath }) => publicPath)]);

for (const { publicPath: relative } of fontRoutes) {
  const name = relative.slice(relative.lastIndexOf("/") + 1);
  const expected = await readFile(path.join(root, "public", "fonts", name));
  const full = await request(relative, { headers: { "Cache-Control": "no-cache", Pragma: "no-cache" } });
  const bytes = await readBounded(full, expected.length + 1);
  assert(full.status === 200, `${name} GET failed: HTTP ${full.status}.`);
  assert(bytes.equals(expected), `${name} production bytes differ from source.`);
  assert(responseHasFontHeaders(full), `${name} has the wrong MIME, cache, security, or route headers.`);
  const etag = full.headers.get("etag");
  assert(etag, `${name} omitted ETag.`);

  const head = await request(relative, { method: "HEAD" });
  const headBytes = await readBounded(head, 1);
  assert(head.status === 200 && headBytes.length === 0, `${name} HEAD semantics failed.`);
  assert(responseHasFontHeaders(head), `${name} HEAD headers failed.`);
  assert(head.headers.get("etag") === etag, `${name} HEAD changed its ETag.`);
  const headLength = head.headers.get("content-length");
  assert(headLength === null || Number(headLength) === expected.length, `${name} HEAD changed its Content-Length.`);

  const ranged = await request(relative, { headers: { Range: "bytes=0-3" } });
  const rangedBytes = await readBounded(ranged, expected.length + 1);
  const partialReady = ranged.status === 206
    && rangedBytes.toString("ascii") === "wOF2"
    && ranged.headers.get("content-range") === `bytes 0-3/${expected.length}`
    && ranged.headers.get("etag") === etag
    && (ranged.headers.get("content-length") === null || Number(ranged.headers.get("content-length")) === 4);
  const exactFallbackReady = ranged.status === 200
    && ranged.headers.get("content-range") === null
    && rangedBytes.equals(expected)
    && ranged.headers.get("etag") === etag
    && (ranged.headers.get("content-length") === null || Number(ranged.headers.get("content-length")) === expected.length);
  assert(partialReady || exactFallbackReady, `${name} Range semantics failed: HTTP ${ranged.status}.`);
  assert(responseHasFontHeaders(ranged), `${name} Range headers failed.`);

  const conditional = await request(relative, { headers: { "If-None-Match": etag } });
  const conditionalBytes = await readBounded(conditional, 1);
  assert(conditional.status === 304 && conditionalBytes.length === 0, `${name} conditional request returned ${conditional.status}.`);
  assert(responseHasFontHeaders(conditional, { contentType: false }), `${name} 304 headers failed.`);
  const conditionalType = conditional.headers.get("content-type");
  assert(conditionalType === null || /^font\/woff2(?:;|$)/iu.test(conditionalType), `${name} 304 has an unsafe MIME.`);
  assert(conditional.headers.get("etag") === etag, `${name} 304 changed its ETag.`);
  checks.push([name, {
    protocol: `GET/HEAD/${partialReady ? "206" : "exact-200"}/304`,
    date: full.headers.get("date"),
    age: full.headers.get("age"),
    etag,
  }]);
}

const missingFont = await request("/witness-fonts/not-shipped.woff2");
const missingFontBytes = await readBounded(missingFont, 64_000);
assert(missingFont.status === 404, `Missing font returned HTTP ${missingFont.status}.`);
assert(missingFont.headers.get("x-alexandria-asset-route") === null, "A missing font entered the selective Worker route.");
assert(missingFont.headers.get("x-alexandria-worker-route") === applicationWorkerMarker, "A missing font did not use the safe application-Worker fallback.");
assert(!/^font\/woff2(?:;|$)/iu.test(missingFont.headers.get("content-type") || ""), "A missing font was mislabeled as WOFF2.");
checks.push(["missing font remains outside route", { status: missingFont.status, bytes: missingFontBytes.length }]);

const unsafe = await request("/api/recover", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url: "http://127.0.0.1/" }),
});
const unsafeBytes = await readBounded(unsafe, 64_000);
assert(unsafe.status === 400, `Unsafe URL returned HTTP ${unsafe.status}.`);
assert(unsafe.headers.get("x-recovery-id") === null, "Rejected unsafe URL unexpectedly admitted a recovery.");
checks.push(["unsafe URL admits no recovery", { status: unsafe.status, bytes: unsafeBytes.length }]);

const receipt = await request("/api/recover/00000000-0000-4000-8000-000000000000/receipt");
const receiptBytes = await readBounded(receipt, 64_000);
assert(receipt.status === 404, `Unknown receipt returned HTTP ${receipt.status}.`);
checks.push(["unknown receipt", { status: receipt.status, bytes: receiptBytes.length }]);

if (process.env.ALEXANDRIA_REFERENCE_RECOVERY_PATH) {
  const match = process.env.ALEXANDRIA_REFERENCE_RECOVERY_PATH.match(/^\/r\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/?$/iu);
  assert(match, "ALEXANDRIA_REFERENCE_RECOVERY_PATH must be /r/<UUID>.");
  const [, recoveryId] = match;
  const referenceTags = [...landingHtml.matchAll(/<a\b[^>]*>/giu)].filter(([tag]) => {
    const classes = tag.match(/\bclass=["']([^"']*)["']/iu)?.[1] || "";
    return classes.split(/\s+/u).includes("reference-recovery-link");
  });
  assert(referenceTags.length === 1, `Landing exposed ${referenceTags.length} reference recovery links.`);
  const deployedReferenceHref = referenceTags[0][0].match(/\bhref=["']([^"']+)["']/iu)?.[1];
  assert(deployedReferenceHref, "The landing reference link omitted href.");
  const deployedReferenceUrl = new URL(deployedReferenceHref, baseUrl);
  assert(deployedReferenceUrl.origin === baseUrl.origin
    && deployedReferenceUrl.pathname.replace(/\/$/u, "") === `/r/${recoveryId}`
    && !deployedReferenceUrl.search
    && !deployedReferenceUrl.hash, "The operator reference path does not match the deployed landing link.");
  const response = await request(`/r/${recoveryId}`);
  const body = (await readBounded(response, 2_000_000)).toString("utf8");
  const normalizedAtlasBody = body.toLowerCase();
  const restoredAtlasLabels = ["returned site", "timeline", "what survived", "witnesses", "recovery receipt", "show the seams"];
  assert(response.status === 200
    && body.includes(recoveryId)
    && restoredAtlasLabels.every((label) => normalizedAtlasBody.includes(label)), "Reference recovery page did not render the complete restored Atlas.");

  const recordResponse = await request(`/api/recover/${recoveryId}`);
  const record = JSON.parse((await readBounded(recordResponse, 2_000_000)).toString("utf8"));
  assert(recordResponse.status === 200
    && record.id === recoveryId
    && record.status === "complete"
    && record.result?.id === recoveryId
    && record.result?.outcome === "restored", "Reference recovery is not a complete durable restored result.");

  const referenceReceiptResponse = await request(`/api/recover/${recoveryId}/receipt`);
  const referenceReceipt = JSON.parse((await readBounded(referenceReceiptResponse, 2_000_000)).toString("utf8"));
  assert(referenceReceiptResponse.status === 200, `Reference receipt returned HTTP ${referenceReceiptResponse.status}.`);
  assert(referenceReceipt.recoveryId === recoveryId && /^[0-9a-f]{64}$/iu.test(referenceReceipt.manifestHash || ""), "Reference receipt identity is invalid.");
  assert(record.result.receipt?.recoveryId === recoveryId
    && record.result.receipt?.manifestHash === referenceReceipt.manifestHash, "Persisted result and receipt endpoint do not share one receipt identity.");
  assert(Array.isArray(referenceReceipt.validationResults)
    && referenceReceipt.validationResults.length > 0
    && referenceReceipt.validationResults.every((validation) => validation?.passed === true), "Reference receipt contains a failed or missing validation result.");
  checks.push(["durable reference recovery", { status: response.status, recoveryId }]);

  if (requireExactReferenceProof) {
    checks.push(["exact submission proof", assertExactReferenceProof({ record, receipt: referenceReceipt, recoveryId })]);
  }
}

if (requireExactReferenceProof && !process.env.ALEXANDRIA_REFERENCE_RECOVERY_PATH) {
  throw new Error("The live submission gate requires ALEXANDRIA_REFERENCE_RECOVERY_PATH.");
}

console.log(JSON.stringify({ origin: baseUrl.origin, checks }, null, 2));
console.log("Production smoke passed.");
