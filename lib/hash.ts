export async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

type EvidenceBlockHashFields = {
  id: string;
  sourceId: string;
  captureId: string;
  kind: string;
  exactText: string;
  position: number;
  originalUrl: string;
  archiveUrl: string;
  capturedAt: string;
  targetUrl?: string;
  assetUrl?: string;
  warnings: string[];
};

export function legacyEvidenceBlockHashInput(block: Pick<EvidenceBlockHashFields, "kind" | "exactText" | "targetUrl" | "assetUrl">) {
  return `${block.kind}\n${block.exactText}\n${block.targetUrl || ""}\n${block.assetUrl || ""}`;
}

/** Receipt v1.2 binds exact content to its persisted order, owner, capture, URLs, and extraction warnings. */
export function evidenceBlockHashInput(block: EvidenceBlockHashFields) {
  return stableStringify({
    version: "evidence-block-v2",
    id: block.id,
    sourceId: block.sourceId,
    captureId: block.captureId,
    kind: block.kind,
    exactText: block.exactText,
    position: block.position,
    originalUrl: block.originalUrl,
    archiveUrl: block.archiveUrl,
    capturedAt: block.capturedAt,
    targetUrl: block.targetUrl || "",
    assetUrl: block.assetUrl || "",
    warnings: block.warnings,
  });
}
