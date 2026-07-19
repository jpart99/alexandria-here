import { discoverCaptures, fetchCaptureHtml } from "./archive";
import type { RecoveryEvent, RecoveryResult, RecoveryStage, SourceRecord } from "./domain";
import { buildEvidenceGraph } from "./evidence-graph";
import { extractSourceRecord } from "./extractor";
import { createManifestAndReceipt } from "./planner";
import { completeRecovery, failRecovery, updateRecoveryStage } from "./recovery-store";
import { mapSettledWithConcurrency } from "./concurrency";
import type { ReceiptWarningInput } from "./recovery-warnings";

const CAPTURE_READ_CONCURRENCY = 3;

const STAGE_LABELS: Record<RecoveryStage, string> = {
  finding_captures: "Finding captures",
  reading_surviving_pages: "Reading surviving pages",
  rebuilding_paths: "Rebuilding paths",
  verifying_witnesses: "Verifying witnesses",
  returning_the_site: "Returning the site",
  complete: "Recovery complete",
  failed: "Recovery stopped",
};

export async function runRecovery(args: {
  id: string;
  submittedUrl: string;
  normalizedUrl: string;
  requestedEraYear?: string;
  createdAt: string;
  emit: (event: RecoveryEvent) => void | Promise<void>;
  signal?: AbortSignal;
}): Promise<RecoveryResult> {
  const stage = async (name: RecoveryStage, detail: string) => {
    args.signal?.throwIfAborted();
    await updateRecoveryStage(args.id, name, detail);
    await args.emit({ recoveryId: args.id, stage: name, label: STAGE_LABELS[name], detail });
  };

  try {
    await stage("finding_captures", "Asking the public archive for bounded, timestamped HTML captures.");
    const inventory = await discoverCaptures(args.normalizedUrl, args.requestedEraYear, args.signal);

    await stage(
      "reading_surviving_pages",
      `Reading ${inventory.selected.length} archived page${inventory.selected.length === 1 ? "" : "s"} from ${args.requestedEraYear ? `the requested ${inventory.selectedYear}` : `the strongest coherent ${inventory.selectedYear}`} evidence window.`,
    );
    const records: SourceRecord[] = [];
    const receiptWarnings: ReceiptWarningInput[] = inventory.warnings.map((raw) => ({
      raw,
      occurrence: { scope: "recovery" },
    }));
    const captureResults = await mapSettledWithConcurrency(
      inventory.selected,
      CAPTURE_READ_CONCURRENCY,
      async (capture) => {
        const html = await fetchCaptureHtml(capture, args.signal);
        return extractSourceRecord(capture, html, args.normalizedUrl);
      },
    );
    // A client disconnect aborts every in-flight capture. Preserve that
    // authoritative terminal reason instead of collapsing the rejected reads
    // into the unrelated "none could be safely read" evidence failure below.
    args.signal?.throwIfAborted();
    for (const [index, result] of captureResults.entries()) {
      if (result.status === "fulfilled") {
        records.push(result.value);
      } else {
        const capture = inventory.selected[index];
        const detail = result.reason instanceof Error ? result.reason.message : "unknown_error";
        receiptWarnings.push({
          raw: `capture_failed:${capture.id}:${detail}`,
          occurrence: { scope: "capture", captureId: capture.id, sourceId: capture.sourceId },
        });
      }
    }
    if (records.length === 0) throw new Error("The archive listed captures, but none could be safely read.");

    await stage("rebuilding_paths", `Reconciling ${records.length} surviving pages and their internal references.`);
    const graph = buildEvidenceGraph(records);
    const planned = await createManifestAndReceipt({
      recoveryId: args.id,
      originalUrl: args.normalizedUrl,
      selectedYear: inventory.selectedYear,
      windowStart: inventory.windowStart,
      windowEnd: inventory.windowEnd,
      temporalSelection: inventory.temporalSelection,
      temporalCandidates: inventory.temporalCandidates,
      captures: inventory.selected,
      inventoryCaptures: inventory.all,
      recoveryWarnings: receiptWarnings,
      records,
      graph,
      createdAt: args.createdAt,
      signal: args.signal,
    });

    await stage(
      "verifying_witnesses",
      `Checking ${planned.receipt.counts.renderedBlocks} rendered blocks against their content hashes and source records.`,
    );
    if (planned.receipt.validationResults.some((result) => !result.passed)) {
      throw new Error("The witnessed restoration did not pass its mechanical validation.");
    }

    await stage("returning_the_site", "Persisting the witnessed site, Ghost Map, and content-addressed receipt.");
    const result: RecoveryResult = {
      id: args.id,
      submittedUrl: args.submittedUrl,
      normalizedUrl: args.normalizedUrl,
      createdAt: args.createdAt,
      outcome: planned.manifest.outcome,
      captures: inventory.selected,
      sources: records,
      nodes: graph.nodes,
      edges: graph.edges,
      manifest: planned.manifest,
      receipt: planned.receipt,
      temporalCandidates: inventory.temporalCandidates,
      warnings: planned.receipt.warnings.map((warning) => warning.raw),
    };
    await completeRecovery(args.id, result);
    await args.emit({
      recoveryId: args.id,
      stage: "complete",
      label: STAGE_LABELS.complete,
      detail: result.outcome === "restored" ? "The witnessed restoration is ready." : "The surviving evidence has been returned honestly.",
      completed: true,
      resultPath: `/r/${args.id}`,
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "The recovery failed unexpectedly.";
    await failRecovery(args.id, message);
    await args.emit({ recoveryId: args.id, stage: "failed", label: STAGE_LABELS.failed, detail: message });
    throw error;
  }
}
