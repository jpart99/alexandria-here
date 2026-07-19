import type { GraphEdge, GraphNode, KnownAbsence, SourceRecord } from "./domain";
import { canonicalPath } from "./url-safety";

export type EvidenceGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  knownAbsences: KnownAbsence[];
  conflicts: Array<{
    path: string;
    kind: "title" | "url_variant";
    values: string[];
    sourceIds: string[];
  }>;
};

function hasExactTitleEvidence(record: SourceRecord) {
  if (!record.titleBlockId) return false;
  const titleBlock = record.blocks.find((block) => block.id === record.titleBlockId);
  return titleBlock?.kind === "title" && titleBlock.exactText === record.title;
}

export function buildEvidenceGraph(records: SourceRecord[]): EvidenceGraph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const pageByPath = new Map(records.map((record) => [record.canonicalPath, record]));

  for (const record of records) {
    nodes.push({
      id: record.id,
      kind: "page",
      label: record.title,
      status: record.blocks.length && hasExactTitleEvidence(record) ? "preserved" : "reconstructed_from_sources",
      sourceIds: [record.sourceId],
    });
    for (const block of record.blocks) {
      nodes.push({
        id: block.id,
        kind: "block",
        label: block.exactText.slice(0, 80),
        status: "preserved",
        sourceIds: [block.sourceId],
      });
      edges.push({
        id: `edge-${record.id}-${block.id}`,
        fromNodeId: record.id,
        toNodeId: block.id,
        kind: "contains",
        sourceIds: [block.sourceId],
      });
    }
  }

  const absenceByPath = new Map<string, { label: string; sourceBlockIds: string[] }>();
  for (const record of records) {
    for (const link of record.internalLinks) {
      const targetPath = canonicalPath(link.targetUrl);
      const target = pageByPath.get(targetPath);
      if (target) {
        edges.push({
          id: `edge-ref-${link.sourceBlockId}`,
          fromNodeId: record.id,
          toNodeId: target.id,
          kind: "references",
          sourceIds: [link.sourceBlockId],
        });
      } else {
        const current = absenceByPath.get(targetPath) || { label: link.label, sourceBlockIds: [] };
        current.sourceBlockIds.push(link.sourceBlockId);
        absenceByPath.set(targetPath, current);
      }
    }
  }

  const knownAbsences = Array.from(absenceByPath.entries())
    .filter(([, value]) => value.sourceBlockIds.length > 0)
    .slice(0, 8)
    .map(([path, value], index) => ({
      id: `absence-${index + 1}`,
      path,
      label: value.label || path,
      sourceBlockIds: Array.from(new Set(value.sourceBlockIds)),
    }));
  for (const absence of knownAbsences) {
    nodes.push({
      id: absence.id,
      kind: "absence",
      label: absence.label,
      status: "missing",
      sourceIds: absence.sourceBlockIds,
    });
  }

  const titlesByPath = new Map<string, Array<{ title: string; sourceId: string }>>();
  for (const record of records) {
    if (!hasExactTitleEvidence(record)) continue;
    titlesByPath.set(record.canonicalPath, [
      ...(titlesByPath.get(record.canonicalPath) || []),
      { title: record.title, sourceId: record.sourceId },
    ]);
  }
  const conflicts = Array.from(titlesByPath.entries()).flatMap(([path, titles]) => {
    const values = Array.from(new Set(titles.map((item) => item.title)));
    return values.length > 1
      ? [{ path, kind: "title" as const, values, sourceIds: titles.map((item) => item.sourceId) }]
      : [];
  });

  return { nodes, edges, knownAbsences, conflicts };
}
