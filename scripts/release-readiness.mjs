import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const compiledMode = process.argv.includes("--compiled");
const baseUrl = new URL(process.env.ALEXANDRIA_BASE_URL || "http://127.0.0.1:3100");
const checks = [];

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

const [minimumMajor, minimumMinor] = String(packageJson.engines?.node || "")
  .replace(/^[^0-9]*/, "")
  .split(".")
  .map(Number);
const [actualMajor, actualMinor] = process.versions.node.split(".").map(Number);
const nodeSupported = actualMajor > minimumMajor || (actualMajor === minimumMajor && actualMinor >= minimumMinor);
check("Static/local", "Supported Node runtime", nodeSupported ? "PASS" : "FAIL", `running ${process.version}; requires ${packageJson.engines?.node}`);

const requiredScripts = ["build", "start", "test", "lint", "qa:failure-matrix", "reference:produce"];
const missingScripts = requiredScripts.filter((name) => !packageJson.scripts?.[name]);
check("Static/local", "Release commands declared", missingScripts.length ? "FAIL" : "PASS", missingScripts.length ? `missing: ${missingScripts.join(", ")}` : requiredScripts.join(", "));
check("Static/local", "Package cannot be published", packageJson.private === true ? "PASS" : "FAIL", "package.json private must be true");

const hostingKeys = Object.keys(hosting);
const invalidHostingKeys = hostingKeys.filter((key) => !["project_id", "d1", "r2"].includes(key));
check("Static/local", "Sites hosting manifest", invalidHostingKeys.length === 0 && hosting.d1 === "DB" && hosting.r2 === null ? "PASS" : "FAIL", "logical D1 binding DB; no R2; only Sites-owned keys");

const requiredEnv = ["OPENAI_API_KEY", "OPENAI_MODEL", "NEXT_PUBLIC_REFERENCE_RECOVERY_PATH", "ALEXANDRIA_BASE_URL", "ALEXANDRIA_REFERENCE_URL"];
const missingEnv = requiredEnv.filter((name) => !(name in envExample));
check("Static/local", "Environment contract documented", missingEnv.length ? "FAIL" : "PASS", missingEnv.length ? `missing: ${missingEnv.join(", ")}` : "runtime, public reference, and operator-only variables are separated");
check("Static/local", "Example contains no API secret", isSafeExampleSecret(envExample.OPENAI_API_KEY) ? "PASS" : "FAIL", "OPENAI_API_KEY must be empty in .env.example");
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
const distHosting = await exists("dist/.openai/hosting.json");
const distMigrations = await exists("dist/.openai/drizzle");
let artifactCurrent = false;
if (distIndex && distHosting && distMigrations) {
  const buildInputs = ["app", "build", "db", "lib", "public", "types", "worker", "package.json", "package-lock.json", "vite.config.ts", "next.config.ts"];
  const presentInputs = [];
  for (const item of buildInputs) {
    if (await exists(item)) presentInputs.push(item);
  }
  const latestInput = Math.max(...await Promise.all(presentInputs.map((item) => latestMtime(item))));
  const outputTime = (await stat(path.join(root, "dist/server/index.js"))).mtimeMs;
  const packagedHosting = JSON.parse(await text("dist/.openai/hosting.json"));
  const packagedMigrations = (await readdir(path.join(root, "dist/.openai/drizzle"))).filter((name) => name.endsWith(".sql")).sort();
  artifactCurrent = outputTime >= latestInput
    && JSON.stringify(packagedHosting) === JSON.stringify(hosting)
    && JSON.stringify(packagedMigrations) === JSON.stringify(migrationFiles);
}
check("Compiled local", "Sites artifact is complete and current", artifactCurrent ? "PASS" : compiledMode ? "FAIL" : "PENDING", artifactCurrent ? "Worker entry, hosting metadata, and all migrations are synchronized" : "stop the exact local Worker, run npm run build, then rerun this check");

if (compiledMode) {
  const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (!localHosts.has(baseUrl.hostname)) {
    check("Compiled local", "Loopback-only smoke target", "FAIL", `${baseUrl.hostname} is not a local host`);
  } else {
    try {
      const landing = await fetch(baseUrl, { redirect: "manual" });
      check("Compiled local", "Landing route responds", landing.status === 200 ? "PASS" : "FAIL", `HTTP ${landing.status} from ${baseUrl.origin}`);
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

check("External authority", "Sites project and private deployment", "PENDING", hosting.project_id ? "project_id is configured, but publishing still requires explicit user approval and a successful deployment result" : "requires explicit user approval, Sites project creation, source push, version save, and private deployment");
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
