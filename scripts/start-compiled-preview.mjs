import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import {
  isPathContained,
  normalizePreviewArguments,
  previewEnvironment,
  rebaseWranglerConfig,
} from "./compiled-preview-contract.mjs";
import {
  createFreshPreviewConfigDirectory,
  ensureContainedDirectory,
  writeExclusivePreviewConfig,
} from "./compiled-preview-files.mjs";

const root = process.cwd();
const sourceConfigPath = path.join(root, "dist", "server", "wrangler.json");
const scratchRootPath = path.join(root, ".wrangler");
await mkdir(scratchRootPath, { recursive: true });
const scratchRootStat = await lstat(scratchRootPath);
if (!scratchRootStat.isDirectory() || scratchRootStat.isSymbolicLink()) throw new Error("Workspace .wrangler must be a real directory.");
const scratchRoot = await realpath(scratchRootPath);
const realRoot = await realpath(root);
if (!isPathContained(realRoot, scratchRoot) || path.basename(scratchRoot).toLowerCase() !== ".wrangler") {
  throw new Error("Workspace .wrangler resolved outside the project boundary.");
}

const passthrough = normalizePreviewArguments(process.argv.slice(2), { root: realRoot });
const persistIndex = passthrough.indexOf("--persist-to");
if (persistIndex >= 0) {
  passthrough[persistIndex + 1] = await ensureContainedDirectory(scratchRoot, passthrough[persistIndex + 1]);
}

const previewConfigDir = await createFreshPreviewConfigDirectory(scratchRoot);
const previewConfigPath = path.join(previewConfigDir, "wrangler.json");

const sourceConfig = rebaseWranglerConfig(JSON.parse(await readFile(sourceConfigPath, "utf8")), sourceConfigPath);
sourceConfig.vars = { ...(sourceConfig.vars || {}) };
delete sourceConfig.vars.OPENAI_API_KEY;
sourceConfig.vars.RECOVERY_RATE_LIMIT_SECRET = randomBytes(32).toString("hex");
await writeExclusivePreviewConfig(previewConfigPath, `${JSON.stringify(sourceConfig)}\n`);
const previewConfigEntries = await readdir(previewConfigDir);
if (previewConfigEntries.length !== 1 || previewConfigEntries[0] !== "wrangler.json") {
  throw new Error("Fresh preview config directory contains an unexpected file.");
}

const require = createRequire(import.meta.url);
const wranglerPackagePath = require.resolve("wrangler/package.json");
const wranglerPackage = JSON.parse(await readFile(wranglerPackagePath, "utf8"));
const wranglerBin = typeof wranglerPackage.bin === "string" ? wranglerPackage.bin : wranglerPackage.bin?.wrangler;
if (!wranglerBin) throw new Error("The installed Wrangler package does not declare its CLI entrypoint.");
const wranglerCliPath = path.resolve(path.dirname(wranglerPackagePath), wranglerBin);

const child = spawn(
  process.execPath,
  [wranglerCliPath, "dev", "--config", previewConfigPath, "--local", ...passthrough],
  { cwd: root, env: previewEnvironment(process.env), stdio: "inherit", windowsHide: true },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

const exitCode = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
});
process.exitCode = exitCode;
