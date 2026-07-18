const forbiddenSegments = new Set([".aws", ".azure", ".docker", ".git", ".gnupg", ".kube", ".ssh", ".wrangler", "gcloud", "node_modules"]);
const forbiddenExactBasenames = new Set([".gitconfig", ".git-credentials", ".netrc", ".npmrc", "credentials.json"]);
const archiveSuffixes = [".tar.gz", ".tar", ".tgz", ".zip", ".gz", ".bz2", ".xz", ".zst", ".7z", ".rar"];

export function forbiddenArtifactReason(relativePath, options = {}) {
  if (options.symbolicLink === true) return "symbolic link";
  const normalized = String(relativePath).replaceAll("\\", "/");
  const segments = normalized.split("/").filter(Boolean).map((segment) => segment.toLowerCase());
  const basename = segments.at(-1) || "";
  if (segments.some((segment) => forbiddenSegments.has(segment))) return "generated-state directory";
  if (/^\.env(?:$|[._~-])/u.test(basename) || /^\.envrc(?:$|[._~-])/u.test(basename) || /^\.dev\.vars(?:$|[._~-])/u.test(basename)) return "environment file";
  if (forbiddenExactBasenames.has(basename)) return "credential file";
  if (/\.log(?:$|[._~-])/u.test(basename)) return "runtime log";
  if (/\.(?:sqlite3?|db)(?:$|[-.])/u.test(basename)) return "local database state";
  if (archiveSuffixes.some((suffix) => basename.endsWith(suffix))) return "nested archive";
  if (/\.(?:pem|key|p12|pfx|ppk)(?:$|[._~-])/u.test(basename) || /^(?:id_rsa|id_dsa|id_ecdsa|id_ed25519)(?:$|[._~-])/u.test(basename)) return "private key material";
  return null;
}

export function isForbiddenArtifactPath(relativePath, options = {}) {
  return forbiddenArtifactReason(relativePath, options) !== null;
}
