import path from "node:path";

const allowedValueOptions = new Set(["--ip", "--log-level", "--persist-to", "--port"]);
const loopbackAddresses = new Set(["127.0.0.1", "::1"]);
const logLevels = new Set(["debug", "info", "log", "warn", "error", "none"]);
const strippedEnvironmentKeys = new Set([
  "CF_API_KEY",
  "CF_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_KEY",
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_EMAIL",
  "CLOUDFLARE_INCLUDE_PROCESS_ENV",
  "CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV",
  "OPENAI_API_KEY",
  "RECOVERY_RATE_LIMIT_SECRET",
  "WRANGLER_ACCOUNT_ID",
  "WRANGLER_API_TOKEN",
  "WRANGLER_CACHE_DIR",
  "WRANGLER_LOG_PATH",
  "WRANGLER_OUTPUT_FILE_DIRECTORY",
  "WRANGLER_OUTPUT_FILE_PATH",
  "WRANGLER_REGISTRY_PATH",
]);
const strippedEnvironmentPrefixes = ["CF_", "CLOUDFLARE_", "MINIFLARE_", "WRANGLER_"];

export function isPathContained(parentPath, candidatePath) {
  const relative = path.relative(path.resolve(parentPath), path.resolve(candidatePath));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function normalizePreviewArguments(arguments_, options) {
  const root = path.resolve(options.root);
  const scratchRoot = path.join(root, ".wrangler");
  const normalized = [];
  const seen = new Set();
  for (let index = 0; index < arguments_.length; index += 1) {
    const raw = String(arguments_[index]);
    if (!raw.startsWith("--")) throw new Error(`Unsupported compiled-preview argument: ${raw || "(empty)"}`);
    const equalsIndex = raw.indexOf("=");
    const name = equalsIndex >= 0 ? raw.slice(0, equalsIndex) : raw;
    if (!allowedValueOptions.has(name)) throw new Error(`Unsupported compiled-preview argument: ${name}`);
    if (seen.has(name)) throw new Error(`Duplicate compiled-preview argument: ${name}`);
    seen.add(name);
    let value = equalsIndex >= 0 ? raw.slice(equalsIndex + 1) : undefined;
    if (value === undefined) {
      value = arguments_[index + 1];
      if (value === undefined || String(value).startsWith("--")) throw new Error(`${name} requires a value.`);
      index += 1;
    }
    value = String(value);
    if (name === "--ip" && !loopbackAddresses.has(value)) throw new Error("--ip must remain loopback-only.");
    if (name === "--log-level" && !logLevels.has(value)) throw new Error("--log-level is invalid.");
    if (name === "--port") {
      const port = Number(value);
      if (!/^\d+$/u.test(value) || !Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("--port must be an integer from 1 to 65535.");
      value = String(port);
    }
    if (name === "--persist-to") {
      const resolved = path.resolve(root, value);
      if (!isPathContained(scratchRoot, resolved)) throw new Error("--persist-to must resolve inside the workspace .wrangler directory.");
      value = resolved;
    }
    normalized.push(name, value);
  }
  return normalized;
}

export function rebaseWranglerConfig(config, sourceConfigPath) {
  const result = structuredClone(config);
  result.send_metrics = false;
  const sourceConfigDir = path.dirname(path.resolve(sourceConfigPath));
  const absoluteFromSource = (value) => typeof value === "string" && value.length > 0
    ? path.resolve(sourceConfigDir, value)
    : value;
  result.main = absoluteFromSource(result.main);
  if (result.assets?.directory) result.assets.directory = absoluteFromSource(result.assets.directory);
  if (result.build?.watch_dir) result.build.watch_dir = absoluteFromSource(result.build.watch_dir);
  for (const database of result.d1_databases || []) {
    if (database.migrations_dir) database.migrations_dir = absoluteFromSource(database.migrations_dir);
  }
  return result;
}

export function previewEnvironment(environment) {
  return Object.fromEntries(Object.entries(environment).filter(([key]) => {
    const upperKey = key.toUpperCase();
    return !strippedEnvironmentKeys.has(upperKey)
      && !strippedEnvironmentPrefixes.some((prefix) => upperKey.startsWith(prefix));
  }));
}
