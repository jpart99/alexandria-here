export const recoveryStages = [
  "finding_captures",
  "reading_surviving_pages",
  "rebuilding_paths",
  "verifying_witnesses",
  "returning_the_site",
  "complete",
  "failed",
] as const;

export type RecoveryStage = (typeof recoveryStages)[number];
export type EvidenceStatus =
  | "preserved"
  | "reconstructed_from_sources"
  | "missing";

export type Capture = {
  id: string;
  sourceId: string;
  originalUrl: string;
  archiveUrl: string;
  timestamp: string;
  capturedAt: string;
  statusCode: number;
  mimeType: string;
  digest?: string;
  warnings: string[];
};

export type EvidenceBlockKind =
  | "title"
  | "heading"
  | "paragraph"
  | "list_item"
  | "quote"
  | "link"
  | "image";

export type EvidenceBlock = {
  id: string;
  sourceId: string;
  captureId: string;
  kind: EvidenceBlockKind;
  exactText: string;
  contentHash: string;
  position: number;
  originalUrl: string;
  archiveUrl: string;
  capturedAt: string;
  targetUrl?: string;
  assetUrl?: string;
  warnings: string[];
};

export type SourceRecord = {
  id: string;
  sourceId: string;
  capture: Capture;
  canonicalPath: string;
  title: string;
  titleBlockId?: string;
  blocks: EvidenceBlock[];
  internalLinks: Array<{
    targetUrl: string;
    sourceBlockId: string;
    label: string;
  }>;
  warnings: string[];
};

export type GraphNode = {
  id: string;
  kind: "page" | "block" | "absence";
  label: string;
  status: EvidenceStatus;
  sourceIds: string[];
};

export type GraphEdge = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  kind: "contains" | "references" | "supports";
  sourceIds: string[];
};

export type RestorationDecision = {
  id: string;
  kind: "era_selection" | "page_order" | "navigation_label" | "known_absence" | "primary_witness";
  targetIds: string[];
  sourceIds: string[];
  primarySourceId?: string;
  supportingSourceIds?: string[];
  proposedBy: "deterministic" | "gpt-5.6";
  validatorRule: string;
  result: "accepted" | "rejected";
};

export type RestoredPage = {
  id: string;
  path: string;
  title: string;
  status: EvidenceStatus;
  sourceIds: string[];
  primarySourceId?: string;
  supportingSourceIds: string[];
  blockIds: string[];
  missingReason?: string;
};

export type KnownAbsence = {
  id: string;
  path: string;
  label: string;
  sourceBlockIds: string[];
};

export type RestorationManifest = {
  schemaVersion: "2.0";
  outcome: "restored" | "insufficient_evidence";
  insufficientReason?: string;
  originalUrl: string;
  recoveredTitle: string;
  selectedWindowStart: string;
  selectedWindowEnd: string;
  selectedEraLabel: string;
  pages: RestoredPage[];
  /** Additive in v2: absent on legacy manifests and derived from accepted cited decisions when rendered. */
  knownAbsences?: KnownAbsence[];
  navigation: Array<{ label: string; pageId: string; sourceIds: string[] }>;
  notes: string[];
};

export type ValidationResult = {
  rule: string;
  passed: boolean;
  detail: string;
};

export type TemporalSelectionScore = {
  version: "deterministic-year-v1";
  score: number;
  reason: string;
  coverage: number;
  densityProxy: number;
  timeSpreadDays: number;
  duplicateCount: number;
  conflictCount: number;
  inventoryRecordsConsidered: number;
};

export type TemporalCandidateWindow = {
  id: string;
  year: string;
  windowStart: string;
  windowEnd: string;
  captureCount: number;
  pageCoverage: number;
  score: TemporalSelectionScore;
  selected: boolean;
};

export type RecoveryReceiptCapture = {
  id: string;
  sourceId: string;
  originalUrl: string;
  archiveUrl: string;
  capturedAt: string;
  statusCode: number;
  mimeType: string;
  digest?: string;
  warnings: string[];
};

export type RecoveryReceiptWarningOccurrence = {
  scope: "capture" | "source" | "block" | "model" | "recovery";
  sourceId?: string;
  captureId?: string;
  blockId?: string;
};

export type RecoveryReceiptWarning = {
  raw: string;
  category: "capture_failure" | "model_fallback" | "extraction" | "other";
  occurrences: RecoveryReceiptWarningOccurrence[];
};

export type RecoveryReceipt = {
  receiptVersion: "1.0" | "1.1" | "1.2";
  recoveryId: string;
  manifestHash: string;
  sourceHashes: Array<{ blockId: string; hash: string }>;
  captures: RecoveryReceiptCapture[];
  warnings: RecoveryReceiptWarning[];
  model: string | null;
  promptVersion: "chronologist-v2" | null;
  modelSchemaVersion: "temporal-restoration-plan-v2";
  planner: "gpt-5.6" | "deterministic";
  selectedWindowStart: string;
  selectedWindowEnd: string;
  temporalSelection: TemporalSelectionScore;
  temporalCandidates: TemporalCandidateWindow[];
  /** Receipt v1.2 persists the bounded inventory needed to recompute temporal ranking. */
  temporalInventory?: Capture[];
  decisions: RestorationDecision[];
  validationResults: ValidationResult[];
  counts: {
    preservedBlocks: number;
    renderedBlocks: number;
    inferredEdges: number;
    knownAbsences: number;
  };
  generatedAt: string;
};

export type RecoveryResult = {
  id: string;
  submittedUrl: string;
  normalizedUrl: string;
  createdAt: string;
  outcome: "restored" | "insufficient_evidence";
  captures: Capture[];
  sources: SourceRecord[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  manifest: RestorationManifest;
  receipt: RecoveryReceipt;
  temporalCandidates: TemporalCandidateWindow[];
  warnings: string[];
};

export type RecoveryEvent = {
  recoveryId: string;
  stage: RecoveryStage;
  label: string;
  detail: string;
  completed?: boolean;
  resultPath?: string;
};
