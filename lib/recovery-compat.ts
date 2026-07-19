import type {
  Capture,
  RecoveryReceiptCapture,
  RecoveryReceiptWarning,
  RecoveryResult,
} from "./domain";
import {
  aggregateRecoveryWarnings,
  buildReceiptWarnings,
  type ReceiptWarningInput,
} from "./recovery-warnings";
import { evidenceBlockHashInput, legacyEvidenceBlockHashInput, sha256, stableStringify } from "./hash";
import { canonicalPathForReceipt, isSameSiteUrl } from "./url-safety";
import { deriveCaptureId, rankTemporalWindows, validateCaptureReplayIdentity } from "./archive";

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

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function validDate(value: unknown): value is string {
  return nonEmptyString(value) && Number.isFinite(Date.parse(value));
}

function safeHttpUrl(value: unknown): value is string {
  if (!nonEmptyString(value)) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password;
  } catch {
    return false;
  }
}

function archiveReplayUrl(value: unknown): value is string {
  if (!safeHttpUrl(value)) return false;
  const url = new URL(value);
  return url.protocol === "https:"
    && url.hostname.toLowerCase() === "web.archive.org"
    && /^\/web\/\d{14}(?:id_)?\/https?:\/\//iu.test(url.pathname);
}

const evidenceStatuses = new Set(["preserved", "reconstructed_from_sources", "missing"]);
const blockKinds = new Set(["title", "heading", "paragraph", "list_item", "quote", "link", "image"]);
const decisionKinds = new Set(["era_selection", "page_order", "navigation_label", "known_absence", "primary_witness"]);

function compatibleCapture(value: unknown): boolean {
  if (!isObject(value)) return false;
  return nonEmptyString(value.id)
    && nonEmptyString(value.sourceId)
    && safeHttpUrl(value.originalUrl)
    && archiveReplayUrl(value.archiveUrl)
    && /^\d{14}$/u.test(String(value.timestamp || ""))
    && validDate(value.capturedAt)
    && value.statusCode === 200
    && typeof value.mimeType === "string"
    && value.mimeType.toLowerCase() === "text/html"
    && (value.digest === undefined || typeof value.digest === "string")
    && stringArray(value.warnings);
}

function compatibleEvidenceBlock(value: unknown): boolean {
  if (!isObject(value)) return false;
  return nonEmptyString(value.id)
    && nonEmptyString(value.sourceId)
    && nonEmptyString(value.captureId)
    && typeof value.kind === "string"
    && blockKinds.has(value.kind)
    && typeof value.exactText === "string"
    && typeof value.contentHash === "string"
    && /^[0-9a-f]{64}$/iu.test(value.contentHash)
    && nonNegativeInteger(value.position)
    && safeHttpUrl(value.originalUrl)
    && archiveReplayUrl(value.archiveUrl)
    && validDate(value.capturedAt)
    && (value.targetUrl === undefined || safeHttpUrl(value.targetUrl))
    && (value.assetUrl === undefined || archiveReplayUrl(value.assetUrl))
    && stringArray(value.warnings);
}

function compatibleSource(value: unknown): boolean {
  if (!isObject(value) || !compatibleCapture(value.capture) || !Array.isArray(value.blocks)) return false;
  const capture = value.capture as Record<string, unknown>;
  return nonEmptyString(value.id)
    && nonEmptyString(value.sourceId)
    && value.sourceId === capture.sourceId
    && nonEmptyString(value.canonicalPath)
    && value.canonicalPath.startsWith("/")
    && nonEmptyString(value.title)
    && (value.titleBlockId === undefined || typeof value.titleBlockId === "string")
    && value.blocks.every((block) => compatibleEvidenceBlock(block)
      && (block as Record<string, unknown>).sourceId === value.sourceId
      && (block as Record<string, unknown>).captureId === capture.id)
    && Array.isArray(value.internalLinks)
    && value.internalLinks.every((link) => isObject(link)
      && safeHttpUrl(link.targetUrl)
      && nonEmptyString(link.sourceBlockId)
      && typeof link.label === "string")
    && stringArray(value.warnings);
}

function compatiblePage(value: unknown): boolean {
  if (!isObject(value)) return false;
  return nonEmptyString(value.id)
    && nonEmptyString(value.path)
    && value.path.startsWith("/")
    && nonEmptyString(value.title)
    && typeof value.status === "string"
    && evidenceStatuses.has(value.status)
    && stringArray(value.sourceIds)
    && (value.primarySourceId === undefined || typeof value.primarySourceId === "string")
    && (value.supportingSourceIds === undefined || stringArray(value.supportingSourceIds))
    && stringArray(value.blockIds)
    && (value.missingReason === undefined || typeof value.missingReason === "string");
}

function compatibleKnownAbsence(value: unknown): boolean {
  return isObject(value)
    && nonEmptyString(value.id)
    && nonEmptyString(value.path)
    && value.path.startsWith("/")
    && nonEmptyString(value.label)
    && stringArray(value.sourceBlockIds)
    && value.sourceBlockIds.length > 0;
}

function compatibleNavigation(value: unknown): boolean {
  return isObject(value)
    && nonEmptyString(value.label)
    && nonEmptyString(value.pageId)
    && stringArray(value.sourceIds);
}

function compatibleDecision(value: unknown): boolean {
  if (!isObject(value)) return false;
  return nonEmptyString(value.id)
    && typeof value.kind === "string"
    && decisionKinds.has(value.kind)
    && stringArray(value.targetIds)
    && stringArray(value.sourceIds)
    && (value.primarySourceId === undefined || typeof value.primarySourceId === "string")
    && (value.supportingSourceIds === undefined || stringArray(value.supportingSourceIds))
    && (value.proposedBy === "deterministic" || value.proposedBy === "gpt-5.6")
    && nonEmptyString(value.validatorRule)
    && (value.result === "accepted" || value.result === "rejected");
}

function compatibleValidation(value: unknown): boolean {
  return isObject(value)
    && nonEmptyString(value.rule)
    && typeof value.passed === "boolean"
    && typeof value.detail === "string";
}

function compatibleTemporalCandidate(value: unknown): boolean {
  if (!isObject(value) || !compatibleTemporalSelection(value.score)) return false;
  return nonEmptyString(value.id)
    && /^\d{4}$/u.test(String(value.year || ""))
    && validDate(value.windowStart)
    && validDate(value.windowEnd)
    && nonNegativeInteger(value.captureCount)
    && nonNegativeInteger(value.pageCoverage)
    && typeof value.selected === "boolean";
}

function compatibleTemporalSelection(value: unknown): boolean {
  if (!isObject(value)) return false;
  return value.version === "deterministic-year-v1"
    && Number.isFinite(value.score)
    && typeof value.reason === "string"
    && nonNegativeInteger(value.coverage)
    && Number.isFinite(value.densityProxy)
    && (value.densityProxy as number) >= 0
    && Number.isFinite(value.timeSpreadDays)
    && (value.timeSpreadDays as number) >= 0
    && nonNegativeInteger(value.duplicateCount)
    && nonNegativeInteger(value.conflictCount)
    && nonNegativeInteger(value.inventoryRecordsConsidered);
}

function compatibleGraphNode(value: unknown): boolean {
  return isObject(value)
    && nonEmptyString(value.id)
    && (value.kind === "page" || value.kind === "block" || value.kind === "absence")
    && typeof value.label === "string"
    && typeof value.status === "string"
    && evidenceStatuses.has(value.status)
    && stringArray(value.sourceIds);
}

function compatibleGraphEdge(value: unknown): boolean {
  return isObject(value)
    && nonEmptyString(value.id)
    && nonEmptyString(value.fromNodeId)
    && nonEmptyString(value.toNodeId)
    && (value.kind === "contains" || value.kind === "references" || value.kind === "supports")
    && stringArray(value.sourceIds);
}

function compatibleSourceHash(value: unknown): boolean {
  return isObject(value)
    && nonEmptyString(value.blockId)
    && typeof value.hash === "string"
    && /^[0-9a-f]{64}$/iu.test(value.hash);
}

function compatibleCounts(value: unknown): boolean {
  return isObject(value)
    && nonNegativeInteger(value.preservedBlocks)
    && nonNegativeInteger(value.renderedBlocks)
    && nonNegativeInteger(value.inferredEdges)
    && nonNegativeInteger(value.knownAbsences);
}

const renderableKinds = new Set(["heading", "paragraph", "list_item", "quote", "image"]);

function arraysEqual<T>(left: readonly T[], right: readonly T[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function setsEqual(left: readonly string[], right: readonly string[]) {
  return left.length === right.length
    && new Set(left).size === left.length
    && new Set(right).size === right.length
    && left.every((value) => right.includes(value));
}

function captureFactsMatch(left: Capture, right: Capture) {
  const fields = (capture: Capture) => ({
    id: capture.id,
    sourceId: capture.sourceId,
    originalUrl: capture.originalUrl,
    archiveUrl: capture.archiveUrl,
    timestamp: capture.timestamp,
    capturedAt: capture.capturedAt,
    statusCode: capture.statusCode,
    mimeType: capture.mimeType,
    digest: capture.digest,
    warnings: capture.warnings,
  });
  return stableStringify(fields(left)) === stableStringify(fields(right));
}

function normalizedTitleKey(value: string) {
  return value.replace(/\s+/gu, " ").trim().toLocaleLowerCase("en-US");
}

function fullPathTitle(path: string) {
  if (path === "/") return "Home";
  return path.split("/").filter(Boolean)
    .map((segment) => segment.replace(/-/gu, " ").replace(/\b\w/gu, (letter) => letter.toUpperCase()))
    .join(" / ");
}

function exactWindowLabel(start: string, end: string) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const format = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  if (startDate.toISOString().slice(0, 10) === endDate.toISOString().slice(0, 10)) {
    return `Recovered as captured on ${format.format(startDate)}`;
  }
  return `Recovered from a coherent window between ${format.format(startDate)} and ${format.format(endDate)}`;
}

function uniqueInOrder(values: string[]) {
  return Array.from(new Set(values));
}

function exactObjectMatch(left: unknown, right: unknown) {
  return stableStringify(left) === stableStringify(right);
}

function expectedNavigation(pages: Array<Record<string, unknown>>) {
  const visible = pages.filter((page) => page.status !== "missing");
  const usableTitleCounts = new Map<string, number>();
  for (const page of visible) {
    const title = String(page.title).trim();
    if (!title || title.length > 60) continue;
    const key = normalizedTitleKey(title);
    usableTitleCounts.set(key, (usableTitleCounts.get(key) || 0) + 1);
  }
  const labels = visible.map((page) => {
    const title = String(page.title).trim();
    if (title && title.length <= 60 && usableTitleCounts.get(normalizedTitleKey(title)) === 1) return title;
    return fullPathTitle(String(page.path)).slice(0, 60);
  });
  const labelCounts = new Map<string, number>();
  for (const label of labels) {
    const key = normalizedTitleKey(label);
    labelCounts.set(key, (labelCounts.get(key) || 0) + 1);
  }
  return visible.map((page, index) => ({
    pageId: String(page.id),
    label: (labelCounts.get(normalizedTitleKey(labels[index])) || 0) > 1
      ? fullPathTitle(String(page.path)).slice(0, 60)
      : labels[index],
    sourceIds: typeof page.primarySourceId === "string"
      ? [page.primarySourceId]
      : (page.sourceIds as string[]).slice(0, 1),
  }));
}

async function evidenceRelationshipsAreCompatible(args: {
  captures: unknown[];
  sources: unknown[];
  pages: unknown[];
  navigation: unknown[];
  knownAbsences: unknown[] | undefined;
  sourceHashes: unknown[];
  recoveredTitle: string;
  normalizedUrl: string;
  manifest: Record<string, unknown>;
  receipt: Record<string, unknown>;
  temporalCandidates: unknown[];
  receiptCandidates: unknown[];
  temporalInventory: unknown[];
  nodes: unknown[];
  edges: unknown[];
  decisions: unknown[];
  validationResults: unknown[];
}): Promise<boolean> {
  const receiptVersion = String(args.receipt.receiptVersion);
  const hasDurableInventory = receiptVersion === "1.2" || receiptVersion === "1.3";
  const receiptCanonicalPath = (originalUrl: string) => canonicalPathForReceipt(originalUrl, receiptVersion);
  const captures = args.captures as Array<Record<string, unknown>>;
  const sources = args.sources as Array<Record<string, unknown>>;
  const pages = args.pages as Array<Record<string, unknown>>;
  const navigation = args.navigation as Array<Record<string, unknown>>;
  const captureById = new Map(captures.map((capture) => [String(capture.id), capture]));
  const sourceById = new Map(sources.map((source) => [String(source.sourceId), source]));
  const blocks = sources.flatMap((source) => source.blocks as Array<Record<string, unknown>>);
  const blockById = new Map(blocks.map((block) => [String(block.id), block]));
  if (
    captureById.size !== captures.length
    || sourceById.size !== sources.length
    || blockById.size !== blocks.length
    || new Set(pages.map((page) => String(page.id))).size !== pages.length
    || new Set(pages.map((page) => String(page.path))).size !== pages.length
  ) return false;

  const manifestHash = await sha256(stableStringify(args.manifest));
  if (args.receipt.manifestHash !== manifestHash) return false;

  const windowStart = String(args.manifest.selectedWindowStart);
  const windowEnd = String(args.manifest.selectedWindowEnd);
  const windowStartTime = Date.parse(windowStart);
  const windowEndTime = Date.parse(windowEnd);
  if (
    windowStartTime > windowEndTime
    || args.manifest.selectedEraLabel !== exactWindowLabel(windowStart, windowEnd)
    || captures.length > 8
    || sources.length > 8
    || captures.some((capture) => {
      const capturedAt = Date.parse(String(capture.capturedAt));
      return capturedAt < windowStartTime || capturedAt > windowEndTime;
    })
  ) return false;

  const allProvenanceCaptures = [...captures, ...(args.temporalInventory as Array<Record<string, unknown>>)];
  if (hasDurableInventory) {
    const inventoryIds = args.temporalInventory.map((capture) => String((capture as Record<string, unknown>).id));
    if (new Set(inventoryIds).size !== inventoryIds.length) return false;
  }
  for (const capture of allProvenanceCaptures) {
    if (!isSameSiteUrl(String(capture.originalUrl), args.normalizedUrl)) return false;
    try {
      validateCaptureReplayIdentity(new URL(String(capture.archiveUrl)), capture as unknown as Capture);
    } catch {
      return false;
    }
    if (hasDurableInventory) {
      const normalizedOriginal = new URL(String(capture.originalUrl)).toString();
      const expectedId = await deriveCaptureId(
        normalizedOriginal,
        String(capture.timestamp),
        typeof capture.digest === "string" ? capture.digest : undefined,
      );
      if (
        capture.originalUrl !== normalizedOriginal
        || capture.id !== expectedId
        || capture.sourceId !== `source-${expectedId}`
      ) return false;
    }
  }

  for (const source of sources) {
    const sourceCapture = source.capture as Record<string, unknown>;
    const persistedCapture = captureById.get(String(sourceCapture.id));
    if (!persistedCapture) return false;
    if (source.canonicalPath !== receiptCanonicalPath(String(sourceCapture.originalUrl))) return false;
    for (const key of ["sourceId", "originalUrl", "archiveUrl", "timestamp", "capturedAt", "statusCode", "mimeType", "digest"] as const) {
      if ((persistedCapture[key] ?? undefined) !== (sourceCapture[key] ?? undefined)) return false;
    }
    const titleBlockId = typeof source.titleBlockId === "string" ? source.titleBlockId : undefined;
    for (const block of source.blocks as Array<Record<string, unknown>>) {
      if (
        block.originalUrl !== sourceCapture.originalUrl
        || block.archiveUrl !== sourceCapture.archiveUrl
        || block.capturedAt !== sourceCapture.capturedAt
      ) return false;
    }
    const internalLinks = source.internalLinks as Array<Record<string, unknown>>;
    const sourceBlocks = source.blocks as Array<Record<string, unknown>>;
    if (sourceBlocks.some((block, index) => block.position !== index)) return false;
    const linkBlocks = sourceBlocks.filter((block) => block.kind === "link");
    if (linkBlocks.length !== internalLinks.length) return false;
    if (new Set(internalLinks.map((link) => String(link.sourceBlockId))).size !== internalLinks.length) return false;
    for (const link of internalLinks) {
      const block = blockById.get(String(link.sourceBlockId));
      if (
        !block
        || block.sourceId !== source.sourceId
        || block.kind !== "link"
        || block.targetUrl !== link.targetUrl
        || !isSameSiteUrl(String(link.targetUrl), args.normalizedUrl)
        || link.label !== (String(block.exactText) || receiptCanonicalPath(String(link.targetUrl)))
      ) return false;
    }
    if (titleBlockId) {
      const titleBlock = blockById.get(titleBlockId);
      if (!titleBlock || titleBlock.kind !== "title" || titleBlock.sourceId !== source.sourceId || titleBlock.exactText !== source.title) return false;
    } else if (source.title !== (receiptCanonicalPath(String(sourceCapture.originalUrl)) || "Recovered page")) {
      return false;
    }
  }

  const recomputedHashes = await Promise.all(blocks.map((block) => sha256(
    hasDurableInventory
      ? evidenceBlockHashInput(block as unknown as Parameters<typeof evidenceBlockHashInput>[0])
      : legacyEvidenceBlockHashInput(block as unknown as Parameters<typeof legacyEvidenceBlockHashInput>[0]),
  )));
  if (blocks.some((block, index) => block.contentHash !== recomputedHashes[index])) return false;
  const sourceHashes = args.sourceHashes as Array<Record<string, unknown>>;
  const sourceHashByBlock = new Map(sourceHashes.map((entry) => [String(entry.blockId), String(entry.hash)]));
  if (sourceHashByBlock.size !== sourceHashes.length || sourceHashByBlock.size !== blocks.length) return false;
  if (blocks.some((block) => sourceHashByBlock.get(String(block.id)) !== block.contentHash)) return false;

  const sourcePaths = new Set(sources.map((source) => String(source.canonicalPath)));
  const absenceByPath = new Map<string, { label: string; sourceBlockIds: string[] }>();
  for (const source of sources) {
    for (const link of source.internalLinks as Array<Record<string, unknown>>) {
      const path = receiptCanonicalPath(String(link.targetUrl));
      if (sourcePaths.has(path)) continue;
      const current = absenceByPath.get(path) || { label: String(link.label), sourceBlockIds: [] };
      current.sourceBlockIds.push(String(link.sourceBlockId));
      absenceByPath.set(path, current);
    }
  }
  const expectedAbsences = Array.from(absenceByPath.entries()).slice(0, 8).map(([path, value], index) => ({
    id: `absence-${index + 1}`,
    path,
    label: value.label || path,
    sourceBlockIds: uniqueInOrder(value.sourceBlockIds),
  }));

  for (const page of pages) {
    const blockIds = page.blockIds as string[];
    if (page.status === "missing") {
      if (blockIds.length !== 0 || typeof page.primarySourceId === "string") return false;
      const cited = (page.sourceIds as string[]).map((id) => blockById.get(id));
      if (cited.length === 0 || cited.some((block) => block?.kind !== "link" || !block.targetUrl
        || receiptCanonicalPath(String(block.targetUrl)) !== page.path)) return false;
      const exactLabels = cited.map((block) => String(block?.exactText || "")).filter(Boolean);
      if (page.title !== page.path && !exactLabels.includes(String(page.title))) return false;
      if (sourcePaths.has(String(page.path))) return false;
      continue;
    }
    if (typeof page.primarySourceId !== "string") return false;
    const primary = sourceById.get(page.primarySourceId);
    if (!primary || page.title !== primary.title) return false;
    const pathSources = sources.filter((source) => source.canonicalPath === page.path).map((source) => String(source.sourceId));
    if (!setsEqual(page.sourceIds as string[], pathSources)) return false;
    if (!setsEqual(
      page.supportingSourceIds as string[],
      pathSources.filter((sourceId) => sourceId !== page.primarySourceId),
    )) return false;
    const expectedBlockIds = (primary.blocks as Array<Record<string, unknown>>)
      .filter((block) => renderableKinds.has(String(block.kind)))
      .map((block) => String(block.id));
    if (!arraysEqual(blockIds, expectedBlockIds)) return false;
    const hasPreservedBody = (primary.blocks as Array<Record<string, unknown>>)
      .some((block) => renderableKinds.has(String(block.kind)) && block.kind !== "image");
    const titleBlockId = typeof primary.titleBlockId === "string" ? primary.titleBlockId : undefined;
    const hasExactTitle = Boolean(titleBlockId && blockById.get(titleBlockId)?.kind === "title"
      && blockById.get(titleBlockId)?.exactText === primary.title);
    const expectedStatus = hasPreservedBody && hasExactTitle ? "preserved" : "reconstructed_from_sources";
    if (page.status !== expectedStatus) return false;
  }

  const expectedNav = expectedNavigation(pages);
  if (navigation.length !== expectedNav.length || navigation.some((item, index) => {
    const expected = expectedNav[index];
    return item.pageId !== expected.pageId
      || item.label !== expected.label
      || !arraysEqual(item.sourceIds as string[], expected.sourceIds);
  })) return false;

  if (args.knownAbsences) {
    if (!exactObjectMatch(args.knownAbsences, expectedAbsences)) return false;
    for (const absence of args.knownAbsences as Array<Record<string, unknown>>) {
      const cited = (absence.sourceBlockIds as string[]).map((id) => blockById.get(id));
      if (cited.some((block) => block?.kind !== "link" || !block.targetUrl
        || receiptCanonicalPath(String(block.targetUrl)) !== absence.path)) return false;
      const exactLabels = cited.map((block) => String(block?.exactText || "")).filter(Boolean);
      if (absence.label !== absence.path && !exactLabels.includes(String(absence.label))) return false;
      if (sourcePaths.has(String(absence.path))) return false;
    }
  } else if (args.receipt.receiptVersion !== "1.0") {
    return false;
  }

  const visiblePages = pages.filter((page) => page.status !== "missing");
  const missingPages = pages.filter((page) => page.status === "missing");
  const expectedMissing = expectedAbsences
    .slice(0, Math.min(2, Math.max(0, 8 - visiblePages.length)))
    .map((absence, index) => ({
      id: `missing-${index + 1}`,
      path: absence.path,
      title: absence.label,
      status: "missing",
      sourceIds: absence.sourceBlockIds,
      supportingSourceIds: [],
      blockIds: [],
      missingReason: "Surviving links witness this path, but no usable capture was found in the selected archive evidence.",
    }));
  if (!exactObjectMatch(missingPages, expectedMissing) || pages.length > 8) return false;

  const authoritativeCandidates = args.receiptCandidates.length ? args.receiptCandidates : args.temporalCandidates;
  if (args.receiptCandidates.length && args.temporalCandidates.length
    && !exactObjectMatch(args.receiptCandidates, args.temporalCandidates)) return false;
  if (authoritativeCandidates.length) {
    const candidates = authoritativeCandidates as Array<Record<string, unknown>>;
    const selected = candidates.filter((candidate) => candidate.selected === true);
    if (
      candidates.length > 3
      || selected.length !== 1
      || new Set(candidates.map((candidate) => String(candidate.id))).size !== candidates.length
      || candidates.some((candidate) => candidate.id !== `year-${candidate.year}`
        || Date.parse(String(candidate.windowStart)) > Date.parse(String(candidate.windowEnd))
        || String(candidate.windowStart).slice(0, 4) !== candidate.year
        || String(candidate.windowEnd).slice(0, 4) !== candidate.year
        || Number(candidate.captureCount) > 8
        || Number(candidate.pageCoverage) > 8
        || Number((candidate.score as Record<string, unknown>).inventoryRecordsConsidered) > 12)
    ) return false;
    const chosen = selected[0];
    if (
      chosen.windowStart !== windowStart
      || chosen.windowEnd !== windowEnd
      || chosen.year !== windowStart.slice(0, 4)
      || chosen.captureCount !== captures.length
      || chosen.pageCoverage !== (chosen.score as Record<string, unknown>).coverage
      || !exactObjectMatch(chosen.score, args.receipt.temporalSelection)
    ) return false;
  } else if (args.receipt.receiptVersion !== "1.0") {
    return false;
  }

  const selectedCandidate = (authoritativeCandidates as Array<Record<string, unknown>>)
    .find((candidate) => candidate.selected === true);
  if (selectedCandidate) {
    if (hasDurableInventory) {
      const inventory = args.temporalInventory as Capture[];
      if (inventory.length < 1 || inventory.length > 12) return false;
      const selectedYear = String(selectedCandidate.year);
      const recomputedCandidates = rankTemporalWindows(inventory, receiptCanonicalPath).map((candidate) => ({
        id: `year-${candidate.year}`,
        year: candidate.year,
        windowStart: candidate.selected[0].capturedAt,
        windowEnd: candidate.selected[candidate.selected.length - 1].capturedAt,
        captureCount: candidate.selected.length,
        pageCoverage: candidate.score.coverage,
        score: candidate.score,
        selected: candidate.year === selectedYear,
      }));
      const recomputedSelected = rankTemporalWindows(inventory, receiptCanonicalPath)
        .find((candidate) => candidate.year === selectedYear);
      const renderedCaptureById = new Map((captures as unknown as Capture[]).map((capture) => [capture.id, capture]));
      if (
        !recomputedSelected
        || !exactObjectMatch(recomputedCandidates, authoritativeCandidates)
        || !setsEqual(recomputedSelected.selected.map((capture) => capture.id), captures.map((capture) => String(capture.id)))
        || recomputedSelected.selected.some((capture) => {
          const rendered = renderedCaptureById.get(capture.id);
          return !rendered || !captureFactsMatch(capture, rendered);
        })
      ) return false;
    }
  }

  const referenceCount = sources.reduce((count, source) => count
    + (source.internalLinks as Array<Record<string, unknown>>)
      .filter((link) => sourcePaths.has(receiptCanonicalPath(String(link.targetUrl)))).length, 0);
  const expectedCounts = {
    preservedBlocks: blocks.filter((block) => block.kind !== "link" && block.kind !== "title").length,
    renderedBlocks: pages.reduce((count, page) => count + (page.blockIds as string[]).length, 0),
    inferredEdges: referenceCount,
    knownAbsences: expectedAbsences.length,
  };
  if (!exactObjectMatch(args.receipt.counts, expectedCounts)) return false;

  const proposedBy = args.receipt.planner === "gpt-5.6" ? "gpt-5.6" : "deterministic";
  if (
    (proposedBy === "deterministic" && (args.receipt.model !== null || args.receipt.promptVersion !== null))
    || (proposedBy === "gpt-5.6" && (!nonEmptyString(args.receipt.model) || args.receipt.promptVersion !== "chronologist-v2"))
  ) return false;
  const pageOrderSourceIds = uniqueInOrder(visiblePages.flatMap((page) => proposedBy === "gpt-5.6"
    ? [String(page.primarySourceId), ...(page.supportingSourceIds as string[])]
    : page.sourceIds as string[]));
  const expectedDecisions: Array<Record<string, unknown>> = [{
    id: "decision-era-selection",
    kind: "era_selection",
    targetIds: visiblePages.map((page) => String(page.id)).sort(),
    sourceIds: sources.map((source) => String(source.sourceId)).sort(),
    proposedBy: "deterministic",
    validatorRule: "deterministic_temporal_score",
    result: "accepted",
  }, {
    id: "decision-page-order-1",
    kind: "page_order",
    targetIds: visiblePages.map((page) => String(page.id)),
    sourceIds: pageOrderSourceIds,
    proposedBy,
    validatorRule: "known_ids_and_sources_only",
    result: "accepted",
  }, ...visiblePages.map((page) => ({
    id: `decision-primary-${page.id}`,
    kind: "primary_witness",
    targetIds: [String(page.id)],
    sourceIds: [String(page.primarySourceId), ...(page.supportingSourceIds as string[])],
    primarySourceId: String(page.primarySourceId),
    supportingSourceIds: page.supportingSourceIds as string[],
    proposedBy,
    validatorRule: "primary_record_belongs_to_page_and_blocks_from_primary_only",
    result: "accepted",
  })), ...expectedAbsences.map((absence) => ({
    id: `decision-absence-${absence.id}`,
    kind: "known_absence",
    targetIds: [absence.id],
    sourceIds: absence.sourceBlockIds,
    proposedBy: "deterministic",
    validatorRule: "surviving_reference_without_selected_capture",
    result: "accepted",
  }))];
  const actualDecisions = args.decisions as Array<Record<string, unknown>>;
  const expectedDecisionById = new Map(expectedDecisions.map((decision) => [String(decision.id), decision]));
  if (
    new Set(actualDecisions.map((decision) => String(decision.id))).size !== actualDecisions.length
    || actualDecisions.some((decision) => !exactObjectMatch(decision, expectedDecisionById.get(String(decision.id))))
    || (args.receipt.receiptVersion !== "1.0" && actualDecisions.length !== expectedDecisions.length)
  ) return false;

  const preservedPages = pages.filter((page) => page.status === "preserved");
  const expectedValidations = [{
    rule: "all_rendered_blocks_have_evidence",
    passed: true,
    detail: `${expectedCounts.renderedBlocks} of ${expectedCounts.renderedBlocks} rendered block IDs resolve to evidence.`,
  }, {
    rule: "page_body_uses_only_the_chosen_primary_witness",
    passed: true,
    detail: "Every rendered body block belongs to exactly one validated primary source; supporting witnesses are recorded but never concatenated into the body.",
  }, {
    rule: "missing_pages_have_no_body_blocks",
    passed: true,
    detail: "Missing states are structurally prevented from carrying historical body content.",
  }, {
    rule: "known_absences_have_cited_link_blocks",
    passed: true,
    detail: `${expectedAbsences.length} bounded known absences retain only paths and labels supported by their cited link blocks.`,
  }, {
    rule: "preserved_pages_have_evidence_blocks",
    passed: true,
    detail: "Every page labelled Preserved contains at least one evidence-bearing body block.",
  }, {
    rule: "preserved_page_titles_have_exact_evidence",
    passed: true,
    detail: "Every page labelled Preserved displays a title copied from its chosen primary witness's exact title block.",
  }, {
    rule: "source_block_hashes_match_content",
    passed: true,
    detail: `${blocks.length} of ${blocks.length} source block hashes match their content and evidence-bearing URLs.`,
  }, {
    rule: "receipt_hashes_cover_all_unique_source_blocks",
    passed: true,
    detail: `${blocks.length} unique source blocks produce exactly ${blocks.length} content-addressed receipt entries.`,
  }, {
    rule: "navigation_targets_exist",
    passed: true,
    detail: "Every navigation target resolves to a manifest page.",
  }, {
    rule: "selected_window_matches_sources",
    passed: true,
    detail: `Selected evidence stays within ${windowStart} and ${windowEnd}.`,
  }, {
    rule: "restored_page_budget",
    passed: true,
    detail: "A returned site requires 5–8 pages; insufficient evidence remains a first-class outcome.",
  }, {
    rule: "temporal_candidates_are_bounded_and_authoritative",
    passed: true,
    detail: "One of at most three mechanically ranked candidates exactly matches the selected receipt window and all recovery budgets.",
  }];
  const expectedValidationByRule = new Map(expectedValidations.map((validation) => [validation.rule, validation]));
  const actualValidations = args.validationResults as Array<Record<string, unknown>>;
  if (
    new Set(actualValidations.map((validation) => String(validation.rule))).size !== actualValidations.length
    || actualValidations.some((validation) => !exactObjectMatch(validation, expectedValidationByRule.get(String(validation.rule))))
    || (args.receipt.receiptVersion !== "1.0" && actualValidations.length !== expectedValidations.length)
  ) return false;
  const legacyCoreRules = expectedValidations
    .filter((validation) => !["known_absences_have_cited_link_blocks", "preserved_page_titles_have_exact_evidence"].includes(validation.rule))
    .map((validation) => validation.rule);
  if (args.receipt.receiptVersion === "1.0" && actualValidations.length
    && legacyCoreRules.some((rule) => !actualValidations.some((validation) => validation.rule === rule))) return false;

  const expectedInsufficientReason = `Alexandria found ${preservedPages.length} surviving witness${preservedPages.length === 1 ? "" : "es"}, but not enough connected evidence to return this place faithfully.`;
  if (
    (args.manifest.outcome === "insufficient_evidence" && args.manifest.insufficientReason !== expectedInsufficientReason)
    || (args.manifest.outcome === "restored" && args.manifest.insufficientReason !== undefined)
  ) return false;

  const expectedRecoveredTitle = String(visiblePages.find((page) => page.path === "/")?.title
    || visiblePages[0]?.title
    || new URL(args.normalizedUrl).hostname);
  return args.recoveredTitle === expectedRecoveredTitle;
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
export async function parsePersistedRecoveryResult(serialized: string): Promise<RecoveryResult | null> {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    return null;
  }
  if (!isObject(value) || !isObject(value.manifest) || !isObject(value.receipt)) return null;
  if (
    !nonEmptyString(value.id)
    || !nonEmptyString(value.submittedUrl)
    || !safeHttpUrl(value.normalizedUrl)
    || !validDate(value.createdAt)
    || !Array.isArray(value.sources)
    || !value.sources.every(compatibleSource)
    || !Array.isArray(value.captures)
    || !value.captures.every(compatibleCapture)
    || !Array.isArray(value.manifest.pages)
    || !value.manifest.pages.every((page) => isObject(page)
      && Array.isArray(page.sourceIds)
      && Array.isArray(page.blockIds))
    || !nonEmptyString(value.manifest.originalUrl)
    || !safeHttpUrl(value.manifest.originalUrl)
    || !nonEmptyString(value.manifest.recoveredTitle)
    || !validDate(value.manifest.selectedWindowStart)
    || !validDate(value.manifest.selectedWindowEnd)
    || !nonEmptyString(value.manifest.selectedEraLabel)
    || !Array.isArray(value.receipt.sourceHashes)
    || !value.receipt.sourceHashes.every(compatibleSourceHash)
    || !compatibleCounts(value.receipt.counts)
    || (value.receipt.receiptVersion !== "1.0"
      && value.receipt.receiptVersion !== "1.1"
      && value.receipt.receiptVersion !== "1.2"
      && value.receipt.receiptVersion !== "1.3")
    || value.receipt.recoveryId !== value.id
    || typeof value.receipt.manifestHash !== "string"
    || !/^[0-9a-f]{64}$/iu.test(value.receipt.manifestHash)
    || (value.receipt.model !== null && typeof value.receipt.model !== "string")
    || (value.receipt.promptVersion !== null && typeof value.receipt.promptVersion !== "string")
    || !nonEmptyString(value.receipt.modelSchemaVersion)
    || (value.receipt.planner !== "gpt-5.6" && value.receipt.planner !== "deterministic")
    || !validDate(value.receipt.selectedWindowStart)
    || !validDate(value.receipt.selectedWindowEnd)
    || !compatibleTemporalSelection(value.receipt.temporalSelection)
    || !validDate(value.receipt.generatedAt)
  ) return null;

  if (
    (value.outcome !== undefined && value.outcome !== "restored" && value.outcome !== "insufficient_evidence")
    || (value.manifest.outcome !== "restored" && value.manifest.outcome !== "insufficient_evidence")
    || (value.outcome !== undefined && value.outcome !== value.manifest.outcome)
    || value.manifest.originalUrl !== value.normalizedUrl
    || value.receipt.selectedWindowStart !== value.manifest.selectedWindowStart
    || value.receipt.selectedWindowEnd !== value.manifest.selectedWindowEnd
  ) return null;

  const receiptCandidates = Array.isArray(value.receipt.temporalCandidates)
    ? value.receipt.temporalCandidates
    : [];
  const temporalCandidates = Array.isArray(value.temporalCandidates)
    ? value.temporalCandidates
    : receiptCandidates;
  const temporalInventory = Array.isArray(value.receipt.temporalInventory)
    ? value.receipt.temporalInventory
    : [];
  if (
    !receiptCandidates.every(compatibleTemporalCandidate)
    || !temporalCandidates.every(compatibleTemporalCandidate)
    || !temporalInventory.every(compatibleCapture)
    || temporalInventory.length > 12
    || ((value.receipt.receiptVersion === "1.2" || value.receipt.receiptVersion === "1.3")
      && temporalInventory.length === 0)
  ) return null;
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
  if (!pages.every(compatiblePage)) return null;

  const navigation = Array.isArray(value.manifest.navigation) ? value.manifest.navigation : [];
  const notes = Array.isArray(value.manifest.notes) ? value.manifest.notes : [];
  const knownAbsences = value.manifest.knownAbsences === undefined ? undefined : value.manifest.knownAbsences;
  const decisions = Array.isArray(value.receipt.decisions) ? value.receipt.decisions : [];
  const validationResults = Array.isArray(value.receipt.validationResults) ? value.receipt.validationResults : [];
  const nodes = Array.isArray(value.nodes) ? value.nodes : [];
  const edges = Array.isArray(value.edges) ? value.edges : [];
  if (
    !navigation.every(compatibleNavigation)
    || !stringArray(notes)
    || (knownAbsences !== undefined && (!Array.isArray(knownAbsences)
      || knownAbsences.length > 8
      || !knownAbsences.every(compatibleKnownAbsence)))
    || !decisions.every(compatibleDecision)
    || !validationResults.every(compatibleValidation)
    || !nodes.every(compatibleGraphNode)
    || !edges.every(compatibleGraphEdge)
  ) return null;

  const persistedWarnings = stringWarnings(value.warnings);
  const receiptCaptures = normalizeReceiptCaptures(value.captures);
  const receiptWarnings = normalizeReceiptWarnings(
    value.receipt.warnings,
    persistedWarnings,
    value.captures,
    value.sources,
  );

  if (!await evidenceRelationshipsAreCompatible({
    captures: value.captures,
    sources: value.sources,
    pages,
    navigation,
    knownAbsences: Array.isArray(knownAbsences) ? knownAbsences : undefined,
    sourceHashes: value.receipt.sourceHashes,
    recoveredTitle: value.manifest.recoveredTitle,
    normalizedUrl: value.normalizedUrl,
    manifest: value.manifest,
    receipt: value.receipt,
    temporalCandidates,
    receiptCandidates,
    temporalInventory,
    nodes,
    edges,
    decisions,
    validationResults,
  })) return null;

  return {
    ...value,
    outcome: value.manifest.outcome,
    nodes,
    edges,
    warnings: aggregateRecoveryWarnings(
      persistedWarnings,
      receiptWarnings.map((warning) => warning.raw),
    ),
    temporalCandidates,
    manifest: {
      ...value.manifest,
      outcome: value.manifest.outcome,
      pages,
      ...(knownAbsences !== undefined ? { knownAbsences } : {}),
      navigation,
      notes,
    },
    receipt: {
      ...value.receipt,
      sourceHashes: value.receipt.sourceHashes,
      captures: receiptCaptures,
      warnings: receiptWarnings,
      decisions,
      validationResults,
      temporalCandidates: receiptCandidates.length ? receiptCandidates : temporalCandidates,
      ...(temporalInventory.length ? { temporalInventory } : {}),
    },
  } as RecoveryResult;
}

export async function hydrateRecoveryRecord<T extends { id: string; normalizedUrl: string; resultJson: string | null }>(record: T) {
  const { resultJson, ...metadata } = record;
  const result = resultJson ? await parsePersistedRecoveryResult(resultJson) : null;
  const identityMatches = result
    && metadata.id === result.id
    && metadata.normalizedUrl === result.normalizedUrl;
  return {
    ...metadata,
    result: identityMatches ? result : null,
  };
}
