import type { Capture, EvidenceBlock, RecoveryReceiptWarningOccurrence, RecoveryResult, RestoredPage, SourceRecord, TemporalCandidateWindow } from "./domain";

type WitnessedTitlePage = {
  status: string;
  path: string;
  title: string;
};

function isPlaceholderTitle(title: string) {
  const normalized = title.trim().replace(/\s+/g, " ").toLowerCase();
  return normalized === "untitled document" || normalized.startsWith("index of ");
}

/**
 * Select a useful title only from visible witnessed pages. Generic archive-era
 * document titles remain valid page evidence, but they should not name the
 * returned place when another exact witnessed title is available.
 */
export function selectWitnessedRecoveredTitle(pages: readonly WitnessedTitlePage[], fallback: string) {
  const visiblePages = pages.filter((page) => page.status !== "missing");
  const visibleRoot = visiblePages.find((page) => page.path === "/");
  return (visibleRoot && !isPlaceholderTitle(visibleRoot.title) ? visibleRoot.title : undefined)
    || visiblePages.find((page) => !isPlaceholderTitle(page.title))?.title
    || visibleRoot?.title
    || visiblePages[0]?.title
    || fallback;
}

/**
 * Keep the content-addressed manifest untouched while deriving the title a
 * visitor should see. Legacy receipt 1.3 rows may carry the title of a Missing
 * `/` page even though visible captured pages have exact witnessed titles.
 */
export function displayRecoveredTitle(result: RecoveryResult) {
  return selectWitnessedRecoveredTitle(result.manifest.pages, result.manifest.recoveredTitle);
}

/** Return a title seam only when it resolves through the selected primary. */
export function witnessedTitleBlock(page: RestoredPage | null, sources: readonly SourceRecord[]): EvidenceBlock | undefined {
  if (!page?.primarySourceId) return undefined;
  const primary = sources.find((source) => source.sourceId === page.primarySourceId);
  if (!primary?.titleBlockId) return undefined;
  const block = primary.blocks.find((candidate) => candidate.id === primary.titleBlockId);
  return block?.kind === "title" && block.sourceId === page.primarySourceId && block.exactText === page.title
    ? block
    : undefined;
}

export function summarizeWarningOwners(
  occurrences: readonly RecoveryReceiptWarningOccurrence[],
  maximumExamples = 2,
) {
  const owners = [...new Set(occurrences.map((occurrence) =>
    occurrence.blockId || occurrence.sourceId || occurrence.captureId || occurrence.scope))];
  const limit = Math.max(0, Math.floor(maximumExamples));
  return {
    examples: owners.slice(0, limit),
    remaining: Math.max(0, owners.length - limit),
  };
}

/**
 * Inspect an alternate window only through the persisted receipt inventory.
 * A count mismatch fails closed rather than silently re-querying a changed
 * archive inventory and presenting it as the same candidate.
 */
export function capturesForTemporalCandidate(
  inventory: readonly Capture[],
  candidate: TemporalCandidateWindow,
) {
  const start = Date.parse(candidate.windowStart);
  const end = Date.parse(candidate.windowEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return null;
  const captures = inventory
    .filter((capture) => {
      const capturedAt = Date.parse(capture.capturedAt);
      return Number.isFinite(capturedAt) && capturedAt >= start && capturedAt <= end;
    })
    .sort((left, right) => Date.parse(left.capturedAt) - Date.parse(right.capturedAt));
  return captures.length === candidate.captureCount ? captures : null;
}
