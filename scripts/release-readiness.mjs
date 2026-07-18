import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

import { forbiddenArtifactReason } from "./release-artifact-contract.mjs";

const root = process.cwd();
const compiledMode = process.argv.includes("--compiled");
const baseUrl = new URL(process.env.ALEXANDRIA_BASE_URL || "http://127.0.0.1:3100");
const checks = [];
const unsafeFontReference = /(?:(?:file:|[A-Za-z]:[\\/]|\\\\(?:\?\\UNC\\|[^\\/\s"'`<>]+[\\/]))[^"'`<>\r\n)]{0,32767})\.(?:woff2?|ttf|otf)\b/iu;
const shippedTextExtensions = new Set([".js", ".mjs", ".cjs", ".css", ".html", ".json", ".map"]);
const fontAssets = ["geist-latin.woff2", "cormorant-garamond-latin.woff2"];
const fontAssetPaths = fontAssets.map((name) => `/fonts/${name}`);
const fontCacheControl = "public, max-age=86400";
const fontWorkerRouteMarker = "worker-font-v1";
const applicationWorkerRouteMarker = "app-worker-v1";

function check(section, name, state, detail) {
  checks.push({ section, name, state, detail });
}

async function text(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

async function exists(relativePath) {
  try {
    await stat(path.join(root, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function latestMtime(target) {
  const absolute = path.join(root, target);
  const targetStat = await stat(absolute);
  if (!targetStat.isDirectory()) return targetStat.mtimeMs;
  const entries = await readdir(absolute, { withFileTypes: true });
  const times = await Promise.all(entries.map((entry) => latestMtime(path.join(target, entry.name))));
  return Math.max(targetStat.mtimeMs, ...times);
}

async function filesUnder(target) {
  if (!await exists(target)) return [];
  const absolute = path.join(root, target);
  const entries = await readdir(absolute, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const relative = path.join(target, entry.name);
    return entry.isDirectory() ? filesUnder(relative) : [relative];
  }));
  return nested.flat();
}

async function artifactEntriesUnder(target) {
  if (!await exists(target)) return [];
  const absolute = path.join(root, target);
  const entries = await readdir(absolute, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const relative = path.join(target, entry.name);
    const descriptor = { relative, symbolicLink: entry.isSymbolicLink() };
    return entry.isDirectory() ? [descriptor, ...await artifactEntriesUnder(relative)] : [descriptor];
  }));
  return nested.flat();
}

async function forbiddenGeneratedArtifacts(target) {
  return (await artifactEntriesUnder(target)).flatMap((entry) => {
    const reason = forbiddenArtifactReason(entry.relative, { symbolicLink: entry.symbolicLink });
    return reason ? [{ ...entry, reason }] : [];
  });
}

async function unsafeFontArtifacts(targets) {
  const candidates = (await Promise.all(targets.map((target) => filesUnder(target)))).flat()
    .filter((relative) => shippedTextExtensions.has(path.extname(relative).toLowerCase()));
  const offenders = [];
  for (const relative of candidates) {
    if (unsafeFontReference.test(await text(relative))) offenders.push(relative.split(path.sep).join("/"));
  }
  return offenders;
}

function isSafeExampleSecret(value) {
  return value === "" || /^(optional|example|replace|changeme)$/i.test(value);
}

const packageJson = JSON.parse(await text("package.json"));
const hosting = JSON.parse(await text(".openai/hosting.json"));
const envExample = Object.fromEntries(
  (await text(".env.example"))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1)];
    }),
);
const gitignore = await text(".gitignore");
const matrix = await text("FAILURE_RELIABILITY_MATRIX.md");
const viteSource = await text("vite.config.ts");
const workerSource = await text("worker/index.ts");
const staticHeaders = await exists("public/_headers") ? await text("public/_headers") : "";
const assetCacheHeaderReady = /(?:^|\r?\n)\/assets\/\*\r?\n\s+Cache-Control:\s*public,\s*max-age=31536000,\s*immutable(?:\r?\n|$)/iu.test(staticHeaders);
const fontFallbackHeaderReady = /(?:^|\r?\n)\/fonts\/\*\.woff2\r?\n\s+Content-Type:\s*font\/woff2\r?\n\s+Cache-Control:\s*public,\s*max-age=86400\r?\n\s+X-Content-Type-Options:\s*nosniff(?:\r?\n|$)/iu.test(staticHeaders);
const fontWorkerSourceReady = /assets:\s*\{[\s\S]*?binding:\s*["']ASSETS["'][\s\S]*?run_worker_first:\s*\[\.\.\.FONT_ASSET_PATHS\][\s\S]*?\}/u.test(viteSource)
  && /import\s*\{[^}]*\bfetchFontAsset\b[^}]*\}\s*from\s*["']\.\.\/lib\/font-delivery["']/u.test(workerSource)
  && /await\s+fetchFontAsset\(request,\s*env\.ASSETS\)/u.test(workerSource);

const [minimumMajor, minimumMinor] = String(packageJson.engines?.node || "")
  .replace(/^[^0-9]*/, "")
  .split(".")
  .map(Number);
const [actualMajor, actualMinor] = process.versions.node.split(".").map(Number);
const nodeSupported = actualMajor > minimumMajor || (actualMajor === minimumMajor && actualMinor >= minimumMinor);
check("Static/local", "Supported Node runtime", nodeSupported ? "PASS" : "FAIL", `running ${process.version}; requires ${packageJson.engines?.node}`);

const requiredScripts = ["build", "start", "test", "lint", "qa:failure-matrix", "qa:production", "qa:submission", "reference:produce", "proof:model"];
const missingScripts = requiredScripts.filter((name) => !packageJson.scripts?.[name]);
const isolatedCompiledPreview = packageJson.scripts?.start === "node scripts/start-compiled-preview.mjs"
  && await exists("scripts/start-compiled-preview.mjs");
const releaseCommandsReady = missingScripts.length === 0 && isolatedCompiledPreview;
check("Static/local", "Release commands declared", releaseCommandsReady ? "PASS" : "FAIL", missingScripts.length ? `missing: ${missingScripts.join(", ")}` : isolatedCompiledPreview ? requiredScripts.join(", ") : "start must use the dist-immutable compiled preview launcher");
check("Static/local", "Package cannot be published", packageJson.private === true ? "PASS" : "FAIL", "package.json private must be true");

const hostingKeys = Object.keys(hosting);
const invalidHostingKeys = hostingKeys.filter((key) => !["project_id", "d1", "r2"].includes(key));
const sitesContractReady = invalidHostingKeys.length === 0
  && hosting.d1 === "DB"
  && hosting.r2 === null;
check("Static/local", "Sites hosting manifest", sitesContractReady ? "PASS" : "FAIL", sitesContractReady ? "logical D1 binding DB; no R2; Sites-owned keys only" : "hosting keys or logical bindings are invalid");
check("Static/local", "Selective font Worker route", fontWorkerSourceReady ? "PASS" : "FAIL", fontWorkerSourceReady ? "ASSETS binding and exact shared font-path list feed the Worker decorator" : "Vite/Worker font routing source contract is incomplete");
check("Static/local", "Static header fallback", assetCacheHeaderReady && fontFallbackHeaderReady ? "PASS" : "FAIL", assetCacheHeaderReady && fontFallbackHeaderReady ? "immutable hashed assets plus a non-authoritative WOFF2 fallback" : "public/_headers fallback contract is incomplete");

const requiredEnv = ["OPENAI_API_KEY", "OPENAI_MODEL", "RECOVERY_RATE_LIMIT_SECRET", "NEXT_PUBLIC_REFERENCE_RECOVERY_PATH", "ALEXANDRIA_BASE_URL", "ALEXANDRIA_REFERENCE_URL", "ALEXANDRIA_REFERENCE_RECOVERY_PATH"];
const missingEnv = requiredEnv.filter((name) => !(name in envExample));
check("Static/local", "Environment contract documented", missingEnv.length ? "FAIL" : "PASS", missingEnv.length ? `missing: ${missingEnv.join(", ")}` : "runtime, public reference, and operator-only variables are separated");
check("Static/local", "Example contains no API secret", isSafeExampleSecret(envExample.OPENAI_API_KEY) ? "PASS" : "FAIL", "OPENAI_API_KEY must be empty in .env.example");
check("Static/local", "Example contains no rate-limit secret", isSafeExampleSecret(envExample.RECOVERY_RATE_LIMIT_SECRET) ? "PASS" : "FAIL", "RECOVERY_RATE_LIMIT_SECRET must be empty in .env.example");
check("Static/local", "Model default is explicit", envExample.OPENAI_MODEL === "gpt-5.6" ? "PASS" : "FAIL", `OPENAI_MODEL=${envExample.OPENAI_MODEL || "(missing)"}`);

const requiredIgnorePatterns = [".env*", "!.env.example", "/dist/", "/.wrangler/", "/node_modules", "/failure-matrix.*.log"];
const missingIgnorePatterns = requiredIgnorePatterns.filter((pattern) => !gitignore.includes(pattern));
check("Static/local", "Generated state and secrets excluded", missingIgnorePatterns.length ? "FAIL" : "PASS", missingIgnorePatterns.length ? `missing patterns: ${missingIgnorePatterns.join(", ")}` : "env, dependencies, dist, Wrangler state, and QA logs are ignored");

const requiredMatrixTerms = ["Submitted URL", "Archive allowlist", "Insufficient evidence", "Concurrent work", "Client disconnect", "Durable result cap", "Stale/corrupt result", "Receipt unavailable"];
const missingMatrixTerms = requiredMatrixTerms.filter((term) => !matrix.includes(term));
check("Static/local", "Failure matrix covers release boundaries", missingMatrixTerms.length ? "FAIL" : "PASS", missingMatrixTerms.length ? `missing: ${missingMatrixTerms.join(", ")}` : `${requiredMatrixTerms.length} required boundaries present`);

const journal = JSON.parse(await text("drizzle/meta/_journal.json"));
const migrationFiles = (await readdir(path.join(root, "drizzle"))).filter((name) => name.endsWith(".sql")).sort();
const journalFiles = journal.entries.map((entry) => `${entry.tag}.sql`).sort();
check("Static/local", "D1 migrations are journaled", JSON.stringify(migrationFiles) === JSON.stringify(journalFiles) && migrationFiles.length > 0 ? "PASS" : "FAIL", `${migrationFiles.length} SQL migrations; ${journalFiles.length} journal entries`);

const distIndex = await exists("dist/server/index.js");
const distWrangler = await exists("dist/server/wrangler.json");
const distHosting = await exists("dist/.openai/hosting.json");
const distMigrations = await exists("dist/.openai/drizzle");
const distClient = await exists("dist/client");
const missingArtifactParts = [
  [distIndex, "dist/server/index.js"],
  [distWrangler, "dist/server/wrangler.json"],
  [distHosting, "dist/.openai/hosting.json"],
  [distMigrations, "dist/.openai/drizzle"],
  [distClient, "dist/client"],
].filter(([present]) => !present).map(([, name]) => name);
let artifactCurrent = false;
let artifactDetail = missingArtifactParts.length
  ? `compiled artifact is incomplete: missing ${missingArtifactParts.join(", ")}; run npm run build, then rerun this check`
  : "stop the exact local Worker, run npm run build, then rerun this check";
if (missingArtifactParts.length === 0) {
  const buildInputs = ["app", "build", "db", "lib", "public", "types", "worker", "package.json", "package-lock.json", "vite.config.ts", "next.config.ts"];
  const presentInputs = [];
  for (const item of buildInputs) {
    if (await exists(item)) presentInputs.push(item);
  }
  const latestInput = Math.max(...await Promise.all(presentInputs.map((item) => latestMtime(item))));
  const outputTime = (await stat(path.join(root, "dist/server/index.js"))).mtimeMs;
  const packagedHosting = JSON.parse(await text("dist/.openai/hosting.json"));
  const generatedWrangler = JSON.parse(await text("dist/server/wrangler.json"));
  const packagedMigrations = (await readdir(path.join(root, "dist/.openai/drizzle"))).filter((name) => name.endsWith(".sql")).sort();
  const unsafeArtifacts = await unsafeFontArtifacts(["dist/server", "dist/client"]);
  const forbiddenArtifacts = await forbiddenGeneratedArtifacts("dist");
  const packagedHeadersMatch = await exists("dist/client/_headers")
    && (await readFile(path.join(root, "public/_headers"))).equals(await readFile(path.join(root, "dist/client/_headers")));
  const packagedFontsMatch = (await Promise.all(fontAssets.map(async (name) => {
    const sourcePath = `public/fonts/${name}`;
    const packagedPath = `dist/client/fonts/${name}`;
    return await exists(sourcePath)
      && await exists(packagedPath)
      && (await readFile(path.join(root, sourcePath))).equals(await readFile(path.join(root, packagedPath)));
  }))).every(Boolean);
  const generatedFontRouteReady = generatedWrangler.assets?.binding === "ASSETS"
    && generatedWrangler.assets?.directory === "../client"
    && JSON.stringify(generatedWrangler.assets?.run_worker_first) === JSON.stringify(fontAssetPaths);
  artifactCurrent = outputTime >= latestInput
    && JSON.stringify(packagedHosting) === JSON.stringify(hosting)
    && JSON.stringify(packagedMigrations) === JSON.stringify(migrationFiles)
    && unsafeArtifacts.length === 0
    && forbiddenArtifacts.length === 0
    && packagedHeadersMatch
    && packagedFontsMatch
    && generatedFontRouteReady;
  artifactDetail = forbiddenArtifacts.length
    ? `forbidden generated state in ${forbiddenArtifacts.slice(0, 8).map((entry) => `${entry.relative.split(path.sep).join("/")} (${entry.reason})`).join(", ")}`
    : unsafeArtifacts.length
      ? `unsafe local font reference in ${unsafeArtifacts.join(", ")}`
      : !packagedHeadersMatch
        ? "static asset header rules are missing or differ from public/_headers"
      : !packagedFontsMatch
        ? "self-hosted font files are missing or differ from public/fonts"
      : !generatedFontRouteReady
        ? "generated Wrangler config lacks the exact selective ASSETS font route"
        : artifactCurrent
          ? "Worker entry, selective ASSETS font route, hosting metadata, migrations, fonts, and generated-state exclusions are synchronized"
          : "stop the exact local Worker, run npm run build, then rerun this check";
}
check("Compiled local", "Sites artifact is complete and current", artifactCurrent ? "PASS" : compiledMode ? "FAIL" : "PENDING", artifactDetail);

if (compiledMode) {
  const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (!localHosts.has(baseUrl.hostname)) {
    check("Compiled local", "Loopback-only smoke target", "FAIL", `${baseUrl.hostname} is not a local host`);
  } else {
    try {
      const landing = await fetch(baseUrl, { redirect: "manual" });
      const landingBody = await landing.text();
      const linkHeader = landing.headers.get("link") || "";
      const htmlStylesheetHrefs = [...landingBody.matchAll(/<link\b[^>]*>/giu)]
        .map(([tag]) => ({
          href: tag.match(/\bhref=["']([^"']+)["']/iu)?.[1],
          rel: tag.match(/\brel=["']([^"']+)["']/iu)?.[1] || "",
        }))
        .filter((link) => link.href && /(?:^|\s)stylesheet(?:\s|$)/iu.test(link.rel))
        .map((link) => link.href);
      const headerStylesheetHrefs = [...linkHeader.matchAll(/<([^>]+)>\s*;([^,]*)/giu)]
        .filter(([, , parameters]) => {
          const rel = parameters.match(/(?:^|;)\s*rel\s*=\s*(?:"([^"]*)"|'([^']*)'|([^;\s,]+))/iu);
          const value = rel?.[1] || rel?.[2] || rel?.[3] || "";
          return value.split(/\s+/u).includes("stylesheet");
        })
        .map(([, href]) => href);
      const servedStyleFailures = [];
      const stylesheetLinks = [];
      for (const href of new Set([...htmlStylesheetHrefs, ...headerStylesheetHrefs])) {
        try {
          const url = new URL(href, baseUrl);
          if (url.origin !== baseUrl.origin) {
            servedStyleFailures.push(`${url.origin} (cross-origin stylesheet)`);
          } else {
            stylesheetLinks.push(url);
          }
        } catch {
          servedStyleFailures.push("invalid stylesheet URL");
        }
      }
      const inlineStyles = [...landingBody.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/giu)].map((match) => match[1]);
      if (inlineStyles.some((style) => unsafeFontReference.test(style))) {
        servedStyleFailures.push("inline style contains an unsafe font reference");
      }
      const nonEmptyInlineStyleCount = inlineStyles.filter((style) => style.trim().length > 0).length;
      const fontPreloadFailures = [];
      const preloadTags = [...landingBody.matchAll(/<link\b[^>]*>/giu)].map(([tag]) => tag);
      for (const name of fontAssets) {
        const matches = preloadTags.filter((tag) => {
          const href = tag.match(/\bhref=["']([^"']+)["']/iu)?.[1] || "";
          const rel = tag.match(/\brel=["']([^"']+)["']/iu)?.[1] || "";
          const as = tag.match(/\bas=["']([^"']+)["']/iu)?.[1] || "";
          const type = tag.match(/\btype=["']([^"']+)["']/iu)?.[1] || "";
          const crossOrigin = tag.match(/\bcrossorigin=["']([^"']*)["']/iu);
          let pathname = "";
          try {
            pathname = new URL(href, baseUrl).pathname;
          } catch {
            return false;
          }
          return rel.split(/\s+/u).includes("preload")
            && pathname === `/fonts/${name}`
            && as === "font"
            && type === "font/woff2"
            && crossOrigin !== null
            && (crossOrigin[1] === "" || crossOrigin[1] === "anonymous");
        });
        if (matches.length !== 1) fontPreloadFailures.push(`${name} (${matches.length} valid preload tags)`);
      }
      let verifiedStylesheetCount = 0;
      for (const stylesheetUrl of stylesheetLinks) {
        const stylesheet = await fetch(stylesheetUrl, { redirect: "manual" });
        const stylesheetBody = await stylesheet.text();
        const mime = stylesheet.headers.get("content-type") || "";
        const styleIsValid = stylesheet.status === 200
          && /^text\/css(?:;|$)/iu.test(mime)
          && stylesheetBody.trim().length > 0
          && !unsafeFontReference.test(stylesheetBody)
          && stylesheet.headers.get("x-alexandria-asset-route") === null
          && stylesheet.headers.get("x-alexandria-worker-route") === null;
        if (!styleIsValid) {
          const emptyDetail = stylesheetBody.trim().length === 0 ? "; empty CSS" : "";
          servedStyleFailures.push(`${stylesheetUrl.pathname} (HTTP ${stylesheet.status}; ${mime || "no MIME"}${emptyDetail})`);
        } else {
          verifiedStylesheetCount += 1;
        }
      }
      const hasStyleSurface = verifiedStylesheetCount > 0 || nonEmptyInlineStyleCount > 0;
      const landingClean = landing.status === 200
        && !unsafeFontReference.test(`${linkHeader}\n${landingBody}`)
        && hasStyleSurface
        && fontPreloadFailures.length === 0
        && servedStyleFailures.length === 0;
      check("Compiled local", "Landing route responds", landingClean ? "PASS" : "FAIL", landingClean ? `clean HTTP ${landing.status} from ${baseUrl.origin}; ${verifiedStylesheetCount} linked and ${nonEmptyInlineStyleCount} inline style surface(s); one preload per font` : `unsafe, empty, absent, duplicated, or unavailable served style: ${[...servedStyleFailures, ...fontPreloadFailures].join(", ") || "landing HTML/Link header"}`);

      const servedFontFailures = [];
      const servedFontRangeModes = [];
      for (const name of fontAssets) {
        const fontUrl = new URL(`/fonts/${name}`, baseUrl);
        const response = await fetch(fontUrl, { redirect: "manual" });
        const bytes = Buffer.from(await response.arrayBuffer());
        const expected = await readFile(path.join(root, "public", "fonts", name));
        const mime = response.headers.get("content-type") || "";
        const sharedHeadersReady = /^font\/woff2(?:;|$)/iu.test(mime)
          && response.headers.get("cache-control") === fontCacheControl
          && response.headers.get("x-content-type-options") === "nosniff"
          && response.headers.get("x-alexandria-asset-route") === fontWorkerRouteMarker
          && response.headers.get("x-alexandria-worker-route") === applicationWorkerRouteMarker;
        if (response.status !== 200 || !sharedHeadersReady || !bytes.equals(expected)) {
          servedFontFailures.push(`${name} GET (HTTP ${response.status}; ${mime || "no MIME"}; route ${response.headers.get("x-alexandria-asset-route") || "missing"})`);
          continue;
        }

        const head = await fetch(fontUrl, { method: "HEAD", redirect: "manual" });
        const headBytes = Buffer.from(await head.arrayBuffer());
        if (head.status !== 200
          || headBytes.length !== 0
          || !/^font\/woff2(?:;|$)/iu.test(head.headers.get("content-type") || "")
          || head.headers.get("x-alexandria-asset-route") !== fontWorkerRouteMarker
          || head.headers.get("x-alexandria-worker-route") !== applicationWorkerRouteMarker) {
          servedFontFailures.push(`${name} HEAD (HTTP ${head.status}; ${headBytes.length} bytes)`);
        }

        const range = await fetch(fontUrl, { headers: { Range: "bytes=0-3" }, redirect: "manual" });
        const rangeBytes = Buffer.from(await range.arrayBuffer());
        const partialRangeReady = range.status === 206
          && rangeBytes.toString("ascii") === "wOF2"
          && range.headers.get("content-range") === `bytes 0-3/${expected.length}`;
        // Local Workerd's ASSETS binding may legally ignore Range and return
        // the complete 200 representation. The pure forwarding test proves we
        // do not strip the request; this runtime gate accepts only that exact
        // native fallback or a correct 206 response.
        const fullRangeFallbackReady = range.status === 200
          && range.headers.get("content-range") === null
          && rangeBytes.equals(expected);
        if ((!partialRangeReady && !fullRangeFallbackReady)
          || !/^font\/woff2(?:;|$)/iu.test(range.headers.get("content-type") || "")
          || range.headers.get("x-alexandria-asset-route") !== fontWorkerRouteMarker
          || range.headers.get("x-alexandria-worker-route") !== applicationWorkerRouteMarker) {
          servedFontFailures.push(`${name} Range (HTTP ${range.status}; ${range.headers.get("content-range") || "no content-range"})`);
        } else {
          servedFontRangeModes.push(`${name}:${partialRangeReady ? "206" : "exact-200"}`);
        }

        const etag = response.headers.get("etag");
        if (!etag) {
          servedFontFailures.push(`${name} GET (no ETag)`);
        } else {
          const conditional = await fetch(fontUrl, { headers: { "If-None-Match": etag }, redirect: "manual" });
          if (conditional.status !== 304
            || conditional.body !== null
            || conditional.headers.get("x-alexandria-asset-route") !== fontWorkerRouteMarker
            || conditional.headers.get("x-alexandria-worker-route") !== applicationWorkerRouteMarker) {
            servedFontFailures.push(`${name} conditional (HTTP ${conditional.status})`);
          }
        }
      }
      const missingFont = await fetch(new URL("/fonts/not-shipped.woff2", baseUrl), { redirect: "manual" });
      if (missingFont.status !== 404
        || missingFont.headers.get("x-alexandria-asset-route") !== null
        || missingFont.headers.get("x-alexandria-worker-route") !== applicationWorkerRouteMarker
        || /^font\/woff2(?:;|$)/iu.test(missingFont.headers.get("content-type") || "")) {
        servedFontFailures.push(`missing font mislabeled (HTTP ${missingFont.status})`);
      }
      await missingFont.body?.cancel();
      check("Compiled local", "Self-hosted font protocol", servedFontFailures.length ? "FAIL" : "PASS", servedFontFailures.length ? servedFontFailures.join(", ") : `${fontAssets.length} exact WOFF2 files pass GET, HEAD, native Range (${servedFontRangeModes.join(", ")}), ETag, headers, and negative selectivity`);
      const unsafe = await fetch(new URL("/api/recover", baseUrl), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: "http://127.0.0.1/" }),
      });
      check("Compiled local", "Unsafe URL fails before recovery", unsafe.status === 400 ? "PASS" : "FAIL", `HTTP ${unsafe.status}`);
      const receipt = await fetch(new URL("/api/recover/00000000-0000-4000-8000-000000000000/receipt", baseUrl));
      check("Compiled local", "Unknown receipt fails closed", receipt.status === 404 ? "PASS" : "FAIL", `HTTP ${receipt.status}`);
    } catch (error) {
      check("Compiled local", "Compiled Worker is reachable", "FAIL", error instanceof Error ? error.message : String(error));
    }
  }
} else {
  check("Compiled local", "Runtime smoke", "PENDING", "run npm run qa:release:compiled against an already-built local Worker; this command never starts or rebuilds it");
}

check("External authority", "Sites project and deployment", "PENDING", hosting.project_id ? "project_id is configured, but publishing still requires explicit user approval and a successful deployment result" : "requires explicit user approval, Sites project creation, source push, version save, and deployment");
check("External authority", "Frontier-model execution proof", "PENDING", process.env.OPENAI_API_KEY ? "a key is present in this process, but only a real receipt with planner=gpt-5.6 proves execution" : "configure the hosted secret, then verify a real receipt records planner=gpt-5.6; never claim model use from fallback output");
check("External authority", "Durable reference recovery", "PENDING", process.env.NEXT_PUBLIC_REFERENCE_RECOVERY_PATH ? "a public reference path is configured, but it must still resolve from production D1" : "after deployment, run reference:produce through the ordinary public API and persist its path");

for (const section of ["Static/local", "Compiled local", "External authority"]) {
  console.log(`\n${section}`);
  for (const item of checks.filter((entry) => entry.section === section)) {
    console.log(`${item.state.padEnd(7)} ${item.name} — ${item.detail}`);
  }
}

const enforcedSections = compiledMode ? new Set(["Static/local", "Compiled local"]) : new Set(["Static/local"]);
const failures = checks.filter((item) => enforcedSections.has(item.section) && item.state === "FAIL");
console.log(`\nResult: ${failures.length ? `${failures.length} enforced gate(s) failed.` : "all enforced local gates passed; external gates remain separately authorized."}`);
process.exitCode = failures.length ? 1 : 0;
