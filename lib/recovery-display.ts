import type { RecoveryResult } from "./domain";

/**
 * Keep the content-addressed manifest untouched while deriving the title a
 * visitor should see. Legacy receipt 1.3 rows may carry the title of a Missing
 * `/` page even though visible captured pages have exact witnessed titles.
 */
export function displayRecoveredTitle(result: RecoveryResult) {
  const visiblePages = result.manifest.pages.filter((page) => page.status !== "missing");
  return visiblePages.find((page) => page.path === "/")?.title
    || visiblePages[0]?.title
    || result.manifest.recoveredTitle;
}
