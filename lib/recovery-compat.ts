import type {
  RecoveryReceiptCapture,
  RecoveryReceiptWarning,
  RecoveryResult,
} from "./domain";
import {
  aggregateRecoveryWarnings,
  buildReceiptWarnings,
  type ReceiptWarningInput,
} from "./recovery-warnings";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringWarnings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((warning): warning is string => typeof warning === "string" && warning.length > 0)
    : [];
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function normalizeCaptureCandidates(candidates: unknown[]): RecoveryReceiptCapture[] {
  return candidates.flatMap((capture) => {
    if (!isObject(capture)) return [];
    const captureId = typeof capture.id === "string" ? capture.id : capture.captureId;
    if (
      !nonEmptyString(captureId)
      || !nonEmptyString(capture.sourceId)
      || !nonEmptyString(capture.originalUrl)
      || !nonEmptyString(capture.archiveUrl)
      || !nonEmptyString(capture.capturedAt)
      || !Number.isInteger(capture.statusCode)
      || !nonEmptyString(capture.mimeType)
    ) return [];
    return [{
      id: captureId,
      sourceId: capture.sourceId,
      originalUrl: capture.originalUrl,
      archiveUrl: capture.archiveUrl,
      capturedAt: capture.capturedAt,
      statusCode: capture.statusCode as number,
      mimeType: capture.mimeType,
      ...(nonEmptyString(capture.digest) ? { digest: capture.digest } : {}),
      warnings: stringWarnings(capture.warnings),
    }];
  });
}

function normalizeReceiptCaptures(recoveryCaptures: unknown[]): RecoveryReceiptCapture[] {
  return normalizeCaptureCandidates(recoveryCaptures);
}

function normalizeReceiptWarnings(
  receiptWarnings: unknown,
  recoveryWarnings: string[],
  captures: unknown[],
  sources: unknown[],
): RecoveryReceiptWarning[] {
  const ownerWarnings: ReceiptWarningInput[] = [];
  const ownerWarningStrings = new Set<string>();
  for (const capture of captures) {
    if (!isObject(capture) || typeof capture.id !== "string" || typeof capture.sourceId !== "string") continue;
    for (const warning of stringWarnings(capture.warnings)) {
      ownerWarningStrings.add(warning);
      ownerWarnings.push({
        raw: warning,
        occurrence: { scope: "capture", captureId: capture.id, sourceId: capture.sourceId },
      });
    }
  }
  for (const source of sources) {
    if (!isObject(source) || typeof source.sourceId !== "string") continue;
    const capture = isObject(source.capture) ? source.capture : null;
    const captureId = capture && typeof capture.id === "string" ? capture.id : undefined;
    for (const warning of stringWarnings(source.warnings)) {
      ownerWarningStrings.add(warning);
      ownerWarnings.push({
        raw: warning,
        occurrence: { scope: "source", ...(captureId ? { captureId } : {}), sourceId: source.sourceId },
      });
    }
    if (Array.isArray(source.blocks)) {
      for (const block of source.blocks) {
        if (!isObject(block) || typeof block.id !== "string") continue;
        for (const warning of stringWarnings(block.warnings)) {
          ownerWarningStrings.add(warning);
          ownerWarnings.push({
            raw: warning,
            occurrence: {
              scope: "block",
              ...(captureId ? { captureId } : {}),
              sourceId: source.sourceId,
              blockId: block.id,
            },
          });
        }
      }
    }
  }

  const globalWarnings = recoveryWarnings
    .filter((warning) => !ownerWarningStrings.has(warning))
    .map((warning) => {
      const captureFailure = /^capture_failed:([^:]+):(.*)$/.exec(warning);
      if (captureFailure) {
        const captureId = captureFailure[1];
        const capture = captures.find((candidate) => isObject(candidate) && candidate.id === captureId);
        return {
          raw: warning,
          occurrence: {
            scope: "capture" as const,
            captureId,
            ...(isObject(capture) && typeof capture.sourceId === "string" ? { sourceId: capture.sourceId } : {}),
          },
        };
      }
      return {
        raw: warning,
        occurrence: { scope: warning.startsWith("model_fallback:") ? "model" as const : "recovery" as const },
      };
    });
  const trustedInputs = [...ownerWarnings, ...globalWarnings];
  const trustedByRaw = new Map<string, ReceiptWarningInput[]>();
  for (const input of trustedInputs) {
    const group = trustedByRaw.get(input.raw) || [];
    group.push(input);
    trustedByRaw.set(input.raw, group);
  }
  const receiptRawOrder = aggregateRecoveryWarnings(
    Array.isArray(receiptWarnings)
      ? receiptWarnings.flatMap((warning) => isObject(warning) && nonEmptyString(warning.raw) ? [warning.raw] : [])
      : [],
  );
  const orderedInputs: ReceiptWarningInput[] = [];
  for (const raw of receiptRawOrder) {
    const group = trustedByRaw.get(raw);
    if (!group) continue;
    orderedInputs.push(...group);
    trustedByRaw.delete(raw);
  }
  for (const input of trustedInputs) {
    if (!trustedByRaw.has(input.raw)) continue;
    orderedInputs.push(...trustedByRaw.get(input.raw)!);
    trustedByRaw.delete(input.raw);
  }
  return buildReceiptWarnings(orderedInputs);
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

  const persistedWarnings = stringWarnings(value.warnings);
  const receiptCaptures = normalizeReceiptCaptures(value.captures);
  const receiptWarnings = normalizeReceiptWarnings(
    value.receipt.warnings,
    persistedWarnings,
    value.captures,
    value.sources,
  );

  return {
    ...value,
    outcome: value.outcome === "insufficient_evidence" || value.manifest.outcome === "insufficient_evidence"
      ? "insufficient_evidence"
      : "restored",
    nodes: Array.isArray(value.nodes) ? value.nodes : [],
    edges: Array.isArray(value.edges) ? value.edges : [],
    warnings: aggregateRecoveryWarnings(
      persistedWarnings,
      receiptWarnings.map((warning) => warning.raw),
    ),
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
      captures: receiptCaptures,
      warnings: receiptWarnings,
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
