import type { RecoveryResult } from "./domain";

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
