import { sha256HexSync } from "./sha256-sync";

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /\.localhost$/i,
  /\.local$/i,
  /\.internal$/i,
  /\.home\.arpa$/i,
  /\.(?:example|invalid|test)$/i,
];

function isNonPublicIpv4(hostname: string) {
  const parts = hostname.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return false;
  const octets = parts.map(Number);
  if (octets.some((part) => part > 255)) return true;
  const [a, b, c] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function isNonPublicIpv6(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return (
    host === "::" ||
    host === "::1" ||
    host.startsWith("::") ||
    host.startsWith("ff") ||
    host.startsWith("fc") ||
    host.startsWith("fd") ||
    host.startsWith("fe8") ||
    host.startsWith("fe9") ||
    host.startsWith("fea") ||
    host.startsWith("feb") ||
    host.startsWith("2001:db8") ||
    host.startsWith("2001:10") ||
    host.startsWith("2001:2:") ||
    host.startsWith("64:ff9b:1:")
  );
}

function normalizedHostname(hostname: string) {
  return hostname.toLowerCase().replace(/\.$/, "");
}

export function validateSubmittedUrl(input: unknown): string {
  if (typeof input !== "string" || input.trim().length === 0) {
    throw new Error("Enter a public website address.");
  }

  const submitted = input.trim();
  const explicitScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(submitted)
    || (/^[a-z][a-z0-9+.-]*:/i.test(submitted) && !/^[^/?#]+:\d+(?:[/?#]|$)/.test(submitted));
  const parseTarget = explicitScheme ? submitted : `http://${submitted}`;

  let url: URL;
  try {
    url = new URL(parseTarget);
  } catch {
    throw new Error("That address is not a valid URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only public HTTP and HTTPS addresses can be recovered.");
  }
  if (url.username || url.password) {
    throw new Error("Addresses containing credentials are not allowed.");
  }
  const hostname = normalizedHostname(url.hostname);
  const looksLikeIpv6 = hostname.startsWith("[") && hostname.endsWith("]");
  const looksLikeIpv4 = /^\d+(?:\.\d+){3}$/.test(hostname);
  if (
    !hostname ||
    PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(hostname)) ||
    isNonPublicIpv4(hostname) ||
    isNonPublicIpv6(hostname) ||
    (!looksLikeIpv4 && !looksLikeIpv6 && !hostname.includes("."))
  ) {
    throw new Error("Private, local, loopback, and link-local addresses are not allowed.");
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new Error("Only standard public web ports are allowed.");
  }

  url.hash = "";
  url.username = "";
  url.password = "";
  url.hostname = hostname;
  if (url.pathname === "") url.pathname = "/";
  return url.toString();
}

export function validateArchiveUrl(input: string): URL {
  const url = new URL(input);
  if (
    url.protocol !== "https:" ||
    normalizedHostname(url.hostname) !== "web.archive.org" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  ) {
    throw new Error("Archive retrieval attempted to leave the allowlist.");
  }
  url.hostname = "web.archive.org";
  return url;
}

function canonicalBasePath(originalUrl: string): { basePath: string; url: URL } {
  const url = new URL(originalUrl);
  const segments = (url.pathname || "/")
    .split("/")
    .filter(Boolean)
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    });
  if (segments.length && /^index\.(?:html?|php)$/i.test(segments.at(-1)!)) segments.pop();
  else if (segments.length) segments[segments.length - 1] = segments.at(-1)!.replace(/\.(html?|php)$/i, "");
  const safe = segments
    .map((part) => part.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, ""))
    .filter(Boolean)
    .join("/");
  const basePath = safe ? `/${safe}` : "/";
  return { basePath, url };
}

/**
 * Receipt 1.0â€“1.2 grouped pages by normalized pathname and intentionally
 * ignored the query string. Keep that identity rule available forever so a
 * later runtime never reinterprets an already persisted receipt.
 */
export function canonicalPathLegacy(originalUrl: string): string {
  return canonicalBasePath(originalUrl).basePath;
}

/**
 * Receipt 1.3+ preserves query-bearing page identity. The canonical query is
 * JSON-framed before a full SHA-256 digest, so distinct tuples are not merged
 * by delimiter ambiguity or a shortened hash and decoded values stay out of
 * application routes and routine route logs.
 */
export function canonicalPath(originalUrl: string): string {
  const { basePath, url } = canonicalBasePath(originalUrl);
  const queryEntries = Array.from(url.searchParams.entries()).sort(([keyA, valueA], [keyB, valueB]) =>
    keyA.localeCompare(keyB) || valueA.localeCompare(valueB));
  if (queryEntries.length === 0) return basePath;

  const querySegment = `query-${sha256HexSync(JSON.stringify(queryEntries))}`;
  return basePath === "/" ? `/${querySegment}` : `${basePath}/${querySegment}`;
}

export function canonicalPathForReceipt(originalUrl: string, receiptVersion: string): string {
  return receiptVersion === "1.0" || receiptVersion === "1.1" || receiptVersion === "1.2"
    ? canonicalPathLegacy(originalUrl)
    : canonicalPath(originalUrl);
}

export function isSameSiteUrl(candidate: string, root: string): boolean {
  try {
    const candidateUrl = new URL(candidate);
    const rootUrl = new URL(root);
    const siteHostname = (hostname: string) => normalizedHostname(hostname).replace(/^www\./, "");
    return siteHostname(candidateUrl.hostname) === siteHostname(rootUrl.hostname);
  } catch {
    return false;
  }
}
