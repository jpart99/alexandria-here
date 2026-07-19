import type { SourceRecord } from "./domain";
import { canonicalPath } from "./url-safety";

export type EvidencePacketBounds = {
  selectedYear: string;
  windowStart: string;
  windowEnd: string;
  maxRecords: number;
};

function requireUnique(values: string[], label: string) {
  if (new Set(values).size !== values.length) {
    throw new Error(`Evidence packet contains a duplicate ${label}.`);
  }
}

/** Fail malformed evidence before any archived text can reach a model. */
export function validateEvidencePacket(records: SourceRecord[], bounds: EvidencePacketBounds) {
  if (records.length === 0 || records.length > bounds.maxRecords) {
    throw new Error(`Evidence packet must contain between 1 and ${bounds.maxRecords} source records.`);
  }
  if (!/^\d{4}$/.test(bounds.selectedYear)) throw new Error("Evidence packet selected year is invalid.");
  const windowStart = Date.parse(bounds.windowStart);
  const windowEnd = Date.parse(bounds.windowEnd);
  if (!Number.isFinite(windowStart) || !Number.isFinite(windowEnd) || windowStart > windowEnd) {
    throw new Error("Evidence packet capture window is invalid.");
  }

  requireUnique(records.map((record) => record.id), "record ID");
  requireUnique(records.map((record) => record.sourceId), "source ID");
  requireUnique(records.map((record) => record.capture.id), "capture ID");
  requireUnique(records.flatMap((record) => record.blocks.map((block) => block.id)), "block ID");

  for (const record of records) {
    const capturedAt = Date.parse(record.capture.capturedAt);
    if (
      !Number.isFinite(capturedAt) ||
      record.capture.capturedAt.slice(0, 4) !== bounds.selectedYear ||
      capturedAt < windowStart ||
      capturedAt > windowEnd
    ) {
      throw new Error(`Evidence record ${record.id} falls outside the selected capture window.`);
    }
    if (record.sourceId !== record.capture.sourceId) {
      throw new Error(`Evidence record ${record.id} does not belong to its capture source.`);
    }
    const blockIds = new Set(record.blocks.map((block) => block.id));
    for (const block of record.blocks) {
      if (
        block.sourceId !== record.sourceId ||
        block.captureId !== record.capture.id ||
        block.originalUrl !== record.capture.originalUrl ||
        block.archiveUrl !== record.capture.archiveUrl ||
        block.capturedAt !== record.capture.capturedAt
      ) {
        throw new Error(`Evidence block ${block.id} does not belong to its declared source record.`);
      }
    }
    if (record.titleBlockId && !blockIds.has(record.titleBlockId)) {
      throw new Error(`Evidence record ${record.id} references an unknown title block.`);
    }
    if (record.internalLinks.some((link) => {
      const block = record.blocks.find((candidate) => candidate.id === link.sourceBlockId);
      return !block
        || block.kind !== "link"
        || block.targetUrl !== link.targetUrl
        || link.label !== (block.exactText || canonicalPath(link.targetUrl));
    })) {
      throw new Error(`Evidence record ${record.id} contains a link without a local evidence block.`);
    }
  }
}
