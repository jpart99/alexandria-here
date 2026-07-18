import type { RecoveryResult } from "./domain";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads durable results defensively. Additive v2 fields are normalized so a
 * previously completed recovery remains viewable, while corrupt or genuinely
 * incompatible rows become an unavailable result instead of crashing every
 * route that reads them.
 */
export function parsePersistedRecoveryResult(serialized: string): RecoveryResult | null {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    return null;
  }
  if (!isObject(value) || !isObject(value.manifest) || !isObject(value.receipt)) return null;
  if (
    typeof value.id !== "string"
    || typeof value.normalizedUrl !== "string"
    || !Array.isArray(value.sources)
    || !Array.isArray(value.captures)
    || !Array.isArray(value.manifest.pages)
    || !Array.isArray(value.receipt.sourceHashes)
    || !isObject(value.receipt.counts)
  ) return null;

  const receiptCandidates = Array.isArray(value.receipt.temporalCandidates)
    ? value.receipt.temporalCandidates
    : [];
  const temporalCandidates = Array.isArray(value.temporalCandidates)
    ? value.temporalCandidates
    : receiptCandidates;
  const pages = value.manifest.pages.map((page) => {
    if (!isObject(page)) return page;
    const sourceIds = Array.isArray(page.sourceIds) ? page.sourceIds : [];
    const primarySourceId = typeof page.primarySourceId === "string" ? page.primarySourceId : undefined;
    return {
      ...page,
      sourceIds,
      blockIds: Array.isArray(page.blockIds) ? page.blockIds : [],
      supportingSourceIds: Array.isArray(page.supportingSourceIds)
        ? page.supportingSourceIds
        : sourceIds.filter((sourceId) => sourceId !== primarySourceId),
    };
  });

  return {
    ...value,
    outcome: value.outcome === "insufficient_evidence" || value.manifest.outcome === "insufficient_evidence"
      ? "insufficient_evidence"
      : "restored",
    nodes: Array.isArray(value.nodes) ? value.nodes : [],
    edges: Array.isArray(value.edges) ? value.edges : [],
    warnings: Array.isArray(value.warnings) ? value.warnings : [],
    temporalCandidates,
    manifest: {
      ...value.manifest,
      outcome: value.manifest.outcome === "insufficient_evidence" ? "insufficient_evidence" : "restored",
      pages,
      navigation: Array.isArray(value.manifest.navigation) ? value.manifest.navigation : [],
      notes: Array.isArray(value.manifest.notes) ? value.manifest.notes : [],
    },
    receipt: {
      ...value.receipt,
      sourceHashes: value.receipt.sourceHashes,
      decisions: Array.isArray(value.receipt.decisions) ? value.receipt.decisions : [],
      validationResults: Array.isArray(value.receipt.validationResults) ? value.receipt.validationResults : [],
      temporalCandidates: receiptCandidates.length ? receiptCandidates : temporalCandidates,
    },
  } as RecoveryResult;
}

export function hydrateRecoveryRecord<T extends { resultJson: string | null }>(record: T) {
  const { resultJson, ...metadata } = record;
  return {
    ...metadata,
    result: resultJson ? parsePersistedRecoveryResult(resultJson) : null,
  };
}
