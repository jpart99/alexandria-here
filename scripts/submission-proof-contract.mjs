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

export const EXACT_PATHFINDER_PROOF = Object.freeze({
  recoveryId: "c6adb317-ee2f-4530-9298-e9eb5fe6efd2",
  receiptVersion: "1.3",
  planner: "gpt-5.6",
  model: "gpt-5.6-sol",
  manifestHash: "03f1c3db3e60688b95faf3b25589cb6610b2697369f9c7ee39fc41ec9a6215ab",
  captures: 8,
  preservedPages: 7,
  missingPages: 1,
  renderedBlocks: 249,
  preservedBlocks: 250,
  sourceHashes: 396,
  inferredEdges: 3,
  knownAbsences: 8,
  validations: 12,
  decisions: 17,
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

export function assertExactPathfinderProof({ record, receipt, recoveryId }) {
  assert(recoveryId === EXACT_PATHFINDER_PROOF.recoveryId, "The live submission gate received the wrong Pathfinder recovery ID.");
  assert(record?.id === recoveryId, "Pathfinder recovery envelope identity drifted.");
  assert(record?.status === "complete" && record?.result?.outcome === "restored", "Pathfinder recovery is not a complete restored result.");
  assert(record.result.id === recoveryId, "Pathfinder persisted result identity drifted.");
  assert(receipt?.recoveryId === recoveryId, "Pathfinder receipt identity drifted.");
  assert(receipt.receiptVersion === EXACT_PATHFINDER_PROOF.receiptVersion, "Pathfinder receipt version drifted.");
  assert(receipt.planner === EXACT_PATHFINDER_PROOF.planner, "Pathfinder receipt planner drifted.");
  assert(receipt.model === EXACT_PATHFINDER_PROOF.model, "Pathfinder receipt model drifted.");
  assert(receipt.manifestHash === EXACT_PATHFINDER_PROOF.manifestHash, "Pathfinder manifest hash drifted.");
  const embeddedReceipt = record.result.receipt;
  assert(embeddedReceipt?.recoveryId === recoveryId, "Pathfinder embedded receipt identity drifted.");
  assert(embeddedReceipt.receiptVersion === receipt.receiptVersion, "Pathfinder embedded receipt version drifted.");
  assert(embeddedReceipt.planner === receipt.planner && embeddedReceipt.model === receipt.model, "Pathfinder embedded receipt model attribution drifted.");
  assert(embeddedReceipt.manifestHash === receipt.manifestHash, "Pathfinder embedded receipt manifest hash drifted.");
  assert(Array.isArray(record.result.captures) && record.result.captures.length === EXACT_PATHFINDER_PROOF.captures, "Pathfinder capture count drifted.");
  assert(Array.isArray(receipt.captures) && receipt.captures.length === EXACT_PATHFINDER_PROOF.captures, "Pathfinder receipt capture count drifted.");
  assert(Array.isArray(receipt.sourceHashes) && receipt.sourceHashes.length === EXACT_PATHFINDER_PROOF.sourceHashes, "Pathfinder source-hash count drifted.");
  assert(Array.isArray(embeddedReceipt.sourceHashes) && embeddedReceipt.sourceHashes.length === receipt.sourceHashes.length, "Pathfinder embedded source-hash count drifted.");
  assert(Array.isArray(record.result.manifest?.pages), "Pathfinder manifest pages are unavailable.");
  const pageStatuses = countBy(record.result.manifest.pages, "status");
  assert(record.result.manifest.pages.length === EXACT_PATHFINDER_PROOF.preservedPages + EXACT_PATHFINDER_PROOF.missingPages
    && pageStatuses.get("preserved") === EXACT_PATHFINDER_PROOF.preservedPages
    && pageStatuses.get("missing") === EXACT_PATHFINDER_PROOF.missingPages,
  "Pathfinder returned/missing page counts drifted.");
  assert(receipt.counts?.renderedBlocks === EXACT_PATHFINDER_PROOF.renderedBlocks
    && receipt.counts?.preservedBlocks === EXACT_PATHFINDER_PROOF.preservedBlocks
    && receipt.counts?.inferredEdges === EXACT_PATHFINDER_PROOF.inferredEdges
    && receipt.counts?.knownAbsences === EXACT_PATHFINDER_PROOF.knownAbsences,
  "Pathfinder receipt headline counts drifted.");
  assert(Array.isArray(receipt.validationResults)
    && receipt.validationResults.length === EXACT_PATHFINDER_PROOF.validations
    && receipt.validationResults.every((validation) => validation?.passed === true),
  "Pathfinder receipt validation contract drifted.");
  assert(Array.isArray(receipt.decisions)
    && receipt.decisions.length === EXACT_PATHFINDER_PROOF.decisions
    && receipt.decisions.every((decision) => decision?.result === "accepted"),
  "Pathfinder decision contract drifted.");
  const decisionAttribution = countBy(
    receipt.decisions.map((decision) => ({ attribution: `${decision.kind}:${decision.proposedBy}` })),
    "attribution",
  );
  const expectedAttribution = new Map([
    ["era_selection:deterministic", 1],
    ["page_order:gpt-5.6", 1],
    ["primary_witness:gpt-5.6", 7],
    ["known_absence:deterministic", 8],
  ]);
  assert(decisionAttribution.size === expectedAttribution.size
    && [...expectedAttribution].every(([key, count]) => decisionAttribution.get(key) === count),
  "Pathfinder decision attribution drifted.");
  const warnings = JSON.stringify([record.result.warnings || [], receipt.warnings || []]);
  assert(!/(?:model|planner)[_-]?(?:fallback|failed|error)|fallback[_-]?(?:model|planner)/iu.test(warnings), "Pathfinder proof contains a model-fallback warning.");
  return EXACT_PATHFINDER_PROOF;
}
