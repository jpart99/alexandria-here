import type { Capture, TemporalCandidateWindow, TemporalSelectionScore } from "./domain";
import { canonicalPath, isSameSiteUrl, validateArchiveUrl } from "./url-safety";

const CDX_ENDPOINT = "https://web.archive.org/cdx/search/cdx";
export const RECOVERY_BUDGETS = {
  maxInventoryRecords: 12,
  maxFetchedCaptures: 8,
  minReturnedPages: 5,
  maxReturnedPages: 8,
} as const;

const MAX_INVENTORY_URLS = RECOVERY_BUDGETS.maxInventoryRecords;
const MAX_CAPTURE_METADATA_PER_URL = 8;
const MAX_PREFIX_METADATA_ROWS = 400;
const MAX_RESPONSE_BYTES = 2_500_000;
const REQUEST_TIMEOUT_MS = 12_000;

type CdxRow = [string, string, string, string, string?];

function timestampToIso(timestamp: string): string {
  if (!/^\d{14}$/.test(timestamp)) throw new Error("Archive returned an invalid timestamp.");
  const y = timestamp.slice(0, 4);
  const m = timestamp.slice(4, 6);
  const d = timestamp.slice(6, 8);
  const hh = timestamp.slice(8, 10);
  const mm = timestamp.slice(10, 12);
  const ss = timestamp.slice(12, 14);
  const iso = `${y}-${m}-${d}T${hh}:${mm}:${ss}Z`;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().replace(".000Z", "Z") !== iso) {
    throw new Error("Archive returned an invalid timestamp.");
  }
  return iso;
}

function captureId(originalUrl: string, timestamp: string) {
  const path = canonicalPath(originalUrl).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home";
  return `capture-${path}-${timestamp}`;
}

async function fetchJson(url: URL, externalSignal?: AbortSignal): Promise<unknown> {
  validateArchiveUrl(url.toString());
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "Alexandria-Here/2.0" },
      redirect: "manual",
      signal: externalSignal ? AbortSignal.any([controller.signal, externalSignal]) : controller.signal,
    });
    if (response.status >= 300 && response.status < 400) {
      throw new Error("Archive inventory attempted an unapproved redirect.");
    }
    if (!response.ok) throw new Error(`Archive inventory failed with ${response.status}.`);
    const contentType = response.headers.get("content-type") || "";
    if (!/\bjson\b/i.test(contentType)) throw new Error("Archive inventory was not JSON.");
    const length = Number(response.headers.get("content-length") || "0");
    if (length > MAX_RESPONSE_BYTES) throw new Error("Archive inventory exceeded the response budget.");
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_RESPONSE_BYTES) throw new Error("Archive inventory exceeded the response budget.");
    const text = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
    return JSON.parse(text);
  } finally {
    clearTimeout(timeout);
  }
}

function cdxUrl(originalUrl: string, matchType: "exact" | "prefix", limit: number) {
  const url = new URL(CDX_ENDPOINT);
  url.searchParams.set("url", originalUrl);
  url.searchParams.set("matchType", matchType);
  url.searchParams.set("output", "json");
  url.searchParams.set("fl", "timestamp,original,statuscode,mimetype,digest");
  url.searchParams.append("filter", "statuscode:200");
  url.searchParams.append("filter", "mimetype:text/html");
  url.searchParams.set("collapse", "digest");
  url.searchParams.set("limit", String(limit));
  return url;
}

function chooseEditionCaptures(yearCaptures: Capture[]): Capture[] {
  const medianTime = [...yearCaptures].map(captureTime).sort((a, b) => a - b)[Math.floor(yearCaptures.length / 2)];
  const byPath = new Map<string, Capture[]>();
  for (const capture of yearCaptures) {
    const path = canonicalPath(capture.originalUrl);
    byPath.set(path, [...(byPath.get(path) || []), capture]);
  }
  const representatives = Array.from(byPath.values())
    .map((variants) => [...variants].sort((a, b) =>
      Math.abs(captureTime(a) - medianTime) - Math.abs(captureTime(b) - medianTime)
      || b.capturedAt.localeCompare(a.capturedAt),
    )[0])
    .sort((a, b) => {
      const pathA = canonicalPath(a.originalUrl);
      const pathB = canonicalPath(b.originalUrl);
      return pathA.split("/").filter(Boolean).length - pathB.split("/").filter(Boolean).length
        || pathA.localeCompare(pathB);
    });

  const primaryPageCount = Math.min(5, representatives.length);
  const chosenRepresentatives = representatives.slice(0, primaryPageCount);
  const representativeIds = new Set(chosenRepresentatives.map((capture) => capture.id));
  const chosenPaths = new Set(chosenRepresentatives.map((capture) => canonicalPath(capture.originalUrl)));
  const primaryDigestByPath = new Map(
    chosenRepresentatives.map((capture) => [canonicalPath(capture.originalUrl), capture.digest]),
  );
  const variants = yearCaptures
    .filter((capture) => {
      const path = canonicalPath(capture.originalUrl);
      const primaryDigest = primaryDigestByPath.get(path);
      return chosenPaths.has(path)
        && !representativeIds.has(capture.id)
        && (!capture.digest || !primaryDigest || capture.digest !== primaryDigest);
    })
    .sort((a, b) => {
      const pathA = canonicalPath(a.originalUrl);
      const pathB = canonicalPath(b.originalUrl);
      const differsA = Boolean(a.digest && primaryDigestByPath.get(pathA) && a.digest !== primaryDigestByPath.get(pathA));
      const differsB = Boolean(b.digest && primaryDigestByPath.get(pathB) && b.digest !== primaryDigestByPath.get(pathB));
      return Number(differsB) - Number(differsA)
        || Math.abs(captureTime(a) - medianTime) - Math.abs(captureTime(b) - medianTime)
        || pathA.localeCompare(pathB)
        || b.capturedAt.localeCompare(a.capturedAt);
    })
    .slice(0, 3);
  const selectedIds = new Set([...chosenRepresentatives, ...variants].map((capture) => capture.id));
  const remainingRepresentatives = representatives.filter((capture) => !selectedIds.has(capture.id));
  return [...chosenRepresentatives, ...variants, ...remainingRepresentatives]
    .slice(0, RECOVERY_BUDGETS.maxFetchedCaptures)
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
}

function evenlySampleRows(rows: CdxRow[], limit: number) {
  if (rows.length <= limit) return rows;
  return Array.from({ length: limit }, (_, index) => rows[Math.round(index * (rows.length - 1) / (limit - 1))]);
}

function boundInventoryCandidates(captures: Capture[], requestedYear?: string): Capture[] {
  const byYear = new Map<string, Capture[]>();
  for (const capture of captures) {
    const year = capture.capturedAt.slice(0, 4);
    byYear.set(year, [...(byYear.get(year) || []), capture]);
  }
  const rankedYears = Array.from(byYear.entries()).sort((a, b) => {
    if (requestedYear) {
      if (a[0] === requestedYear && b[0] !== requestedYear) return -1;
      if (b[0] === requestedYear && a[0] !== requestedYear) return 1;
    }
    const coverageA = new Set(a[1].map((capture) => canonicalPath(capture.originalUrl))).size;
    const coverageB = new Set(b[1].map((capture) => canonicalPath(capture.originalUrl))).size;
    const spread = (items: Capture[]) => Math.max(...items.map(captureTime)) - Math.min(...items.map(captureTime));
    return coverageB - coverageA || spread(a[1]) - spread(b[1]) || b[0].localeCompare(a[0]);
  });

  const bounded: Capture[] = [];
  for (const [, yearCaptures] of rankedYears) {
    for (const capture of chooseEditionCaptures(yearCaptures)) {
      if (bounded.length >= RECOVERY_BUDGETS.maxInventoryRecords) return bounded;
      bounded.push(capture);
    }
  }
  return bounded;
}

function parseRows(payload: unknown): CdxRow[] {
  if (!Array.isArray(payload) || payload.length < 2) return [];
  return payload.slice(1).filter((row): row is CdxRow =>
    Array.isArray(row) &&
    row.length >= 4 &&
    row.every((value) => typeof value === "string") &&
    /^\d{14}$/.test(row[0]) &&
    row[2] === "200" &&
    row[3].toLowerCase() === "text/html",
  );
}

function rowToCapture(row: CdxRow): Capture {
  const [timestamp, originalUrl, status, mimeType, digest] = row;
  const parsedOriginal = new URL(originalUrl);
  if (
    !["http:", "https:"].includes(parsedOriginal.protocol) ||
    parsedOriginal.username ||
    parsedOriginal.password
  ) {
    throw new Error("Archive returned an invalid original URL.");
  }
  parsedOriginal.hash = "";
  const normalizedOriginal = parsedOriginal.toString();
  const id = captureId(normalizedOriginal, timestamp);
  return {
    id,
    sourceId: `source-${id}`,
    originalUrl: normalizedOriginal,
    archiveUrl: `https://web.archive.org/web/${timestamp}id_/${normalizedOriginal}`,
    timestamp,
    capturedAt: timestampToIso(timestamp),
    statusCode: Number(status),
    mimeType,
    digest,
    warnings: [],
  };
}

export type CaptureInventory = {
  all: Capture[];
  selected: Capture[];
  selectedYear: string;
  windowStart: string;
  windowEnd: string;
  temporalSelection: TemporalSelectionScore;
  temporalCandidates: TemporalCandidateWindow[];
};

export type ScoredYear = {
  year: string;
  selected: Capture[];
  score: TemporalSelectionScore;
};

export class RequestedEraUnavailableError extends Error {
  readonly requestedYear: string;
  readonly availableYears: string[];

  constructor(requestedYear: string, availableYears: string[]) {
    super(`The requested ${requestedYear} edition is not one of the bounded deterministic candidates (${availableYears.join(", ") || "none"}).`);
    this.name = "RequestedEraUnavailableError";
    this.requestedYear = requestedYear;
    this.availableYears = availableYears;
  }
}

function parentPath(path: string) {
  const segments = path.split("/").filter(Boolean);
  if (segments.length <= 1) return "/";
  return `/${segments.slice(0, -1).join("/")}`;
}

function captureTime(capture: Capture) {
  return new Date(capture.capturedAt).getTime();
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * Selects one coherent calendar-year edition using inventory metadata only.
 * It never inspects or invents page content. Because links are unavailable until
 * captures are fetched, directory-neighbour density is the explicit closure proxy.
 */
export function rankTemporalWindows(captures: Capture[]): ScoredYear[] {
  if (captures.length === 0) throw new Error("No capture candidates were available for temporal selection.");

  if (captures.length > RECOVERY_BUDGETS.maxInventoryRecords) {
    throw new Error(`Temporal selection exceeded the ${RECOVERY_BUDGETS.maxInventoryRecords}-record inventory budget.`);
  }
  const byYear = new Map<string, Capture[]>();
  for (const capture of captures) {
    const year = capture.capturedAt.slice(0, 4);
    byYear.set(year, [...(byYear.get(year) || []), capture]);
  }

  const scored = Array.from(byYear.entries()).map<ScoredYear>(([year, yearCaptures]) => {
    const capturesByPath = new Map<string, Capture[]>();
    for (const capture of yearCaptures) {
      const path = canonicalPath(capture.originalUrl);
      capturesByPath.set(path, [...(capturesByPath.get(path) || []), capture]);
    }

    const selected = chooseEditionCaptures(yearCaptures);

    const selectedPaths = Array.from(new Set(selected.map((capture) => canonicalPath(capture.originalUrl))));
    const parentCounts = new Map<string, number>();
    for (const path of selectedPaths) parentCounts.set(parentPath(path), (parentCounts.get(parentPath(path)) || 0) + 1);
    const neighbourCount = selectedPaths.filter((path) => parentPath(path) === "/" || (parentCounts.get(parentPath(path)) || 0) > 1).length;
    const densityProxy = selectedPaths.length ? neighbourCount / selectedPaths.length : 0;

    let duplicateCount = 0;
    let conflictCount = 0;
    for (const path of selectedPaths) {
      const variants = capturesByPath.get(path) || [];
      const digests = variants.map((capture) => capture.digest).filter((digest): digest is string => Boolean(digest));
      const distinctDigests = new Set(digests);
      duplicateCount += Math.max(0, digests.length - distinctDigests.size);
      if (distinctDigests.size > 1) conflictCount += 1;
    }

    const firstTime = captureTime(selected[0]);
    const lastTime = captureTime(selected[selected.length - 1]);
    const timeSpreadDays = selected.length > 1 ? (lastTime - firstTime) / 86_400_000 : 0;
    const coverage = selectedPaths.length;
    const coveragePoints = coverage * 10;
    const densityPoints = densityProxy * 20;
    const spreadPenalty = Math.min(20, timeSpreadDays / 18.25);
    const conflictPenalty = conflictCount * 8;
    const duplicatePenalty = Math.min(8, duplicateCount);
    const total = round(coveragePoints + densityPoints - spreadPenalty - conflictPenalty - duplicatePenalty);
    const reason = [
      `${coverage} distinct page${coverage === 1 ? "" : "s"} supported`,
      `${round(densityProxy * 100, 0)}% directory-neighbour density`,
      `${round(timeSpreadDays, 1)} day capture spread`,
      `${conflictCount} digest conflict${conflictCount === 1 ? "" : "s"}`,
      `${duplicateCount} duplicate capture${duplicateCount === 1 ? "" : "s"}`,
    ].join("; ");

    return {
      year,
      selected,
      score: {
        version: "deterministic-year-v1",
        score: total,
        reason,
        coverage,
        densityProxy: round(densityProxy),
        timeSpreadDays: round(timeSpreadDays, 1),
        duplicateCount,
        conflictCount,
        inventoryRecordsConsidered: captures.length,
      },
    };
  });

  return scored.sort((a, b) =>
    b.score.score - a.score.score
    || b.score.coverage - a.score.coverage
    || a.score.conflictCount - b.score.conflictCount
    || a.score.timeSpreadDays - b.score.timeSpreadDays
    || b.year.localeCompare(a.year),
  ).slice(0, 3);
}

export function selectTemporalWindow(captures: Capture[], requestedYear?: string): ScoredYear {
  if (requestedYear !== undefined && !/^\d{4}$/.test(requestedYear)) {
    throw new Error("Requested era year must contain exactly four digits.");
  }
  const ranked = rankTemporalWindows(captures);
  if (!requestedYear) return ranked[0];
  const requested = ranked.find((candidate) => candidate.year === requestedYear);
  if (!requested) throw new RequestedEraUnavailableError(requestedYear, ranked.map((candidate) => candidate.year));
  return requested;
}

export async function discoverCaptures(originalUrl: string, requestedYear?: string, signal?: AbortSignal): Promise<CaptureInventory> {
  const prefixPayload = await fetchJson(cdxUrl(originalUrl, "prefix", MAX_PREFIX_METADATA_ROWS), signal);
  const prefixRows = parseRows(prefixPayload).filter((row) => isSameSiteUrl(row[1], originalUrl));
  const originalPath = canonicalPath(originalUrl);
  const distinctUrls = Array.from(
    new Map(prefixRows.map((row) => [canonicalPath(row[1]), row[1]])).entries(),
  )
    .sort(([pathA], [pathB]) => {
      if (pathA === originalPath) return -1;
      if (pathB === originalPath) return 1;
      const depthA = pathA.split("/").filter(Boolean).length;
      const depthB = pathB.split("/").filter(Boolean).length;
      return depthA - depthB || pathA.localeCompare(pathB);
    })
    .slice(0, MAX_INVENTORY_URLS);

  const selectedPaths = new Set(distinctUrls.map(([path]) => path));
  const rowsByPath = new Map<string, CdxRow[]>();
  for (const row of prefixRows) {
    const path = canonicalPath(row[1]);
    if (!selectedPaths.has(path)) continue;
    rowsByPath.set(path, [...(rowsByPath.get(path) || []), row]);
  }
  const unboundedCaptures = Array.from(rowsByPath.values()).flatMap((rows) =>
    evenlySampleRows(rows, MAX_CAPTURE_METADATA_PER_URL).flatMap((row) => {
      try {
        return [rowToCapture(row)];
      } catch {
        return [];
      }
    }),
  );
  const unique = boundInventoryCandidates(
    Array.from(new Map(unboundedCaptures.map((capture) => [capture.id, capture])).values()),
    requestedYear,
  );
  if (unique.length === 0) throw new Error("No usable public HTML captures were found.");

  const rankedWindows = rankTemporalWindows(unique);
  const temporalSelection = requestedYear
    ? rankedWindows.find((candidate) => candidate.year === requestedYear)
    : rankedWindows[0];
  if (!temporalSelection) {
    if (requestedYear && /^\d{4}$/.test(requestedYear)) {
      throw new RequestedEraUnavailableError(requestedYear, rankedWindows.map((candidate) => candidate.year));
    }
    if (requestedYear) throw new Error("Requested era year must contain exactly four digits.");
    throw new Error("No deterministic temporal candidate could be selected.");
  }
  const { year: selectedYear, selected } = temporalSelection;
  const temporalCandidates = rankedWindows.map<TemporalCandidateWindow>((candidate) => ({
    id: `year-${candidate.year}`,
    year: candidate.year,
    windowStart: candidate.selected[0].capturedAt,
    windowEnd: candidate.selected[candidate.selected.length - 1].capturedAt,
    captureCount: candidate.selected.length,
    pageCoverage: candidate.score.coverage,
    score: candidate.score,
    selected: candidate.year === selectedYear,
  }));

  return {
    all: unique,
    selected,
    selectedYear,
    windowStart: selected[0].capturedAt,
    windowEnd: selected[selected.length - 1].capturedAt,
    temporalSelection: temporalSelection.score,
    temporalCandidates,
  };
}

async function fetchAllowedRedirect(url: URL, remainingRedirects = 2, externalSignal?: AbortSignal): Promise<Response> {
  validateArchiveUrl(url.toString());
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "Alexandria-Here/2.0" },
      redirect: "manual",
      signal: externalSignal ? AbortSignal.any([controller.signal, externalSignal]) : controller.signal,
    });
    if (response.status >= 300 && response.status < 400) {
      if (remainingRedirects <= 0) throw new Error("Archive redirect limit exceeded.");
      const location = response.headers.get("location");
      if (!location) throw new Error("Archive returned an invalid redirect.");
      return fetchAllowedRedirect(validateArchiveUrl(new URL(location, url).toString()), remainingRedirects - 1, externalSignal);
    }
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchCaptureHtml(capture: Capture, signal?: AbortSignal): Promise<string> {
  const response = await fetchAllowedRedirect(validateArchiveUrl(capture.archiveUrl), 2, signal);
  if (!response.ok) throw new Error(`Capture ${capture.id} failed with ${response.status}.`);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("html")) throw new Error("Archive capture was not HTML.");
  const length = Number(response.headers.get("content-length") || "0");
  if (length > MAX_RESPONSE_BYTES) throw new Error("Capture exceeded the response budget.");
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_RESPONSE_BYTES) throw new Error("Capture exceeded the response budget.");
  return new TextDecoder("utf-8", { fatal: false }).decode(buffer);
}
