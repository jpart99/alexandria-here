import { lstat, mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import path from "node:path";

import { isPathContained } from "./compiled-preview-contract.mjs";

async function checkedDirectory(directory, boundary) {
  const stats = await lstat(directory);
  if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error(`Preview path must be a real directory: ${directory}`);
  const resolved = await realpath(directory);
  if (!isPathContained(boundary, resolved)) throw new Error(`Preview path resolved outside workspace .wrangler: ${directory}`);
  return resolved;
}

export async function ensureContainedDirectory(boundary, candidate) {
  const resolvedBoundary = await realpath(boundary);
  const absoluteCandidate = path.resolve(candidate);
  if (!isPathContained(resolvedBoundary, absoluteCandidate)) throw new Error("Preview path must remain inside workspace .wrangler.");
  const relative = path.relative(resolvedBoundary, absoluteCandidate);
  let current = resolvedBoundary;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    const next = path.join(current, segment);
    try {
      await lstat(next);
    } catch (error) {
      if (!error || typeof error !== "object" || error.code !== "ENOENT") throw error;
      try {
        await mkdir(next, { mode: 0o700 });
      } catch (mkdirError) {
        if (!mkdirError || typeof mkdirError !== "object" || mkdirError.code !== "EEXIST") throw mkdirError;
      }
    }
    current = await checkedDirectory(next, resolvedBoundary);
  }
  return current;
}

export async function createFreshPreviewConfigDirectory(scratchRoot) {
  const parent = await ensureContainedDirectory(scratchRoot, path.join(scratchRoot, "compiled-preview-configs"));
  const created = await mkdtemp(path.join(parent, "run-"));
  return checkedDirectory(created, await realpath(scratchRoot));
}

export async function writeExclusivePreviewConfig(configPath, contents) {
  try {
    await writeFile(configPath, contents, { encoding: "utf8", flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error && typeof error === "object" && error.code === "EEXIST") {
      throw new Error("Refusing to replace an existing preview config path.", { cause: error });
    }
    throw error;
  }
}
