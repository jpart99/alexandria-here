export const EXACT_REFERENCE_PROOF = Object.freeze({
  recoveryId: "18026989-33be-4011-86ee-19e1754cb22c",
  receiptVersion: "1.0",
  planner: "gpt-5.6",
  model: "gpt-5.6-sol",
  manifestHash: "e4eeddc5cc3a0e1c43c7f0f63e869399d3c566824cd0c44dc1a9af706142e773",
  captures: 8,
  preservedPages: 5,
  missingPages: 2,
  renderedBlocks: 347,
  preservedBlocks: 622,
  sourceHashes: 946,
  inferredEdges: 36,
  knownAbsences: 8,
  validations: 10,
  decisions: 15,
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function countBy(items, key) {
  const counts = new Map();
  for (const item of items) {
    const value = item?.[key];
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return counts;
}

export function assertExactReferenceProof({ record, receipt, recoveryId }) {
  assert(recoveryId === EXACT_REFERENCE_PROOF.recoveryId, "The live submission gate received the wrong judging recovery ID.");
  assert(record?.status === "complete" && record?.result?.outcome === "restored", "Judging recovery is not a complete restored result.");
  assert(receipt?.recoveryId === recoveryId, "Judging receipt identity drifted.");
  assert(receipt.receiptVersion === EXACT_REFERENCE_PROOF.receiptVersion, "Judging receipt version drifted.");
  assert(receipt.planner === EXACT_REFERENCE_PROOF.planner, "Judging receipt planner drifted.");
  assert(receipt.model === EXACT_REFERENCE_PROOF.model, "Judging receipt model drifted.");
  assert(receipt.manifestHash === EXACT_REFERENCE_PROOF.manifestHash, "Judging manifest hash drifted.");
  assert(Array.isArray(record.result.captures) && record.result.captures.length === EXACT_REFERENCE_PROOF.captures, "Judging capture count drifted.");
  assert(Array.isArray(receipt.captures) && receipt.captures.length === EXACT_REFERENCE_PROOF.captures, "Judging receipt capture count drifted.");
  assert(Array.isArray(receipt.sourceHashes) && receipt.sourceHashes.length === EXACT_REFERENCE_PROOF.sourceHashes, "Judging source-hash count drifted.");
  assert(Array.isArray(record.result.manifest?.pages), "Judging manifest pages are unavailable.");
  const pageStatuses = countBy(record.result.manifest.pages, "status");
  assert(record.result.manifest.pages.length === EXACT_REFERENCE_PROOF.preservedPages + EXACT_REFERENCE_PROOF.missingPages
    && pageStatuses.get("preserved") === EXACT_REFERENCE_PROOF.preservedPages
    && pageStatuses.get("missing") === EXACT_REFERENCE_PROOF.missingPages,
  "Judging returned/missing page counts drifted.");
  assert(receipt.counts?.renderedBlocks === EXACT_REFERENCE_PROOF.renderedBlocks
    && receipt.counts?.preservedBlocks === EXACT_REFERENCE_PROOF.preservedBlocks
    && receipt.counts?.inferredEdges === EXACT_REFERENCE_PROOF.inferredEdges
    && receipt.counts?.knownAbsences === EXACT_REFERENCE_PROOF.knownAbsences,
  "Judging receipt headline counts drifted.");
  assert(Array.isArray(receipt.validationResults)
    && receipt.validationResults.length === EXACT_REFERENCE_PROOF.validations
    && receipt.validationResults.every((validation) => validation?.passed === true),
  "Judging receipt validation contract drifted.");
  assert(Array.isArray(receipt.decisions)
    && receipt.decisions.length === EXACT_REFERENCE_PROOF.decisions
    && receipt.decisions.every((decision) => decision?.result === "accepted"),
  "Judging decision contract drifted.");
  const decisionAttribution = countBy(
    receipt.decisions.map((decision) => ({ attribution: `${decision.kind}:${decision.proposedBy}` })),
    "attribution",
  );
  const expectedAttribution = new Map([
    ["era_selection:deterministic", 1],
    ["page_order:gpt-5.6", 1],
    ["primary_witness:gpt-5.6", 5],
    ["known_absence:deterministic", 8],
  ]);
  assert(decisionAttribution.size === expectedAttribution.size
    && [...expectedAttribution].every(([key, count]) => decisionAttribution.get(key) === count),
  "Judging decision attribution drifted.");
  const warnings = JSON.stringify([record.result.warnings || [], receipt.warnings || []]);
  assert(!/(?:model|planner)[_-]?(?:fallback|failed|error)|fallback[_-]?(?:model|planner)/iu.test(warnings), "Judging proof contains a model-fallback warning.");
  return EXACT_REFERENCE_PROOF;
}
