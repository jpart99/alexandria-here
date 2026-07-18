const baseUrl = (process.env.ALEXANDRIA_BASE_URL || "").replace(/\/$/, "");
const targetUrl = process.env.ALEXANDRIA_PROOF_URL || "http://iexile.com/";
const eraYear = process.env.ALEXANDRIA_PROOF_YEAR || "2009";

if (!baseUrl) {
  throw new Error("ALEXANDRIA_BASE_URL is required.");
}

const response = await fetch(`${baseUrl}/api/recover`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url: targetUrl, eraYear }),
});

if (!response.ok || !response.body) {
  const retryAfter = response.headers.get("retry-after");
  const retryHint = retryAfter ? `; retry after ${retryAfter}s` : "";
  throw new Error(`Recovery admission failed (${response.status}${retryHint}): ${await response.text()}`);
}

const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = "";
let recoveryId;
let completed = false;

while (true) {
  const { done, value } = await reader.read();
  buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
  const lines = buffer.split("\n");
  buffer = lines.pop() || "";
  for (const line of lines) {
    if (!line.trim()) continue;
    const event = JSON.parse(line);
    recoveryId ||= event.recoveryId;
    console.log(JSON.stringify(event));
    if (event.completed) completed = true;
  }
  if (done) break;
}

if (buffer.trim()) {
  const event = JSON.parse(buffer);
  recoveryId ||= event.recoveryId;
  console.log(JSON.stringify(event));
  if (event.completed) completed = true;
}

if (!recoveryId) {
  throw new Error("Recovery stream ended without a persisted recovery ID.");
}
if (!completed) {
  const failedResponse = await fetch(`${baseUrl}/api/recover/${encodeURIComponent(recoveryId)}`);
  const failedState = failedResponse.ok ? await failedResponse.json() : null;
  const reason = failedState?.error || failedState?.detail || "the stream ended before completion";
  throw new Error(`Recovery ${recoveryId} ended as ${failedState?.status || "unknown"}: ${reason}`);
}

const receiptResponse = await fetch(`${baseUrl}/api/recover/${encodeURIComponent(recoveryId)}/receipt`);
if (!receiptResponse.ok) {
  throw new Error(`Receipt fetch failed (${receiptResponse.status}): ${await receiptResponse.text()}`);
}
const receipt = await receiptResponse.json();
const resultResponse = await fetch(`${baseUrl}/api/recover/${encodeURIComponent(recoveryId)}`);
const persisted = resultResponse.ok ? await resultResponse.json() : null;
const failed = receipt.validationResults.filter((check) => !check.passed);
const acceptedDecisions = receipt.decisions.filter((decision) => decision.result === "accepted");
const eraDecision = acceptedDecisions.find((decision) => decision.kind === "era_selection");
const pageOrderDecision = acceptedDecisions.find((decision) => decision.kind === "page_order");
const primaryWitnessDecisions = acceptedDecisions.filter((decision) => decision.kind === "primary_witness");
const gptDecisionKinds = [...new Set(
  acceptedDecisions.filter((decision) => decision.proposedBy === "gpt-5.6").map((decision) => decision.kind),
)].sort();
const provenancePassed = Boolean(
  eraDecision?.proposedBy === "deterministic"
  && eraDecision.validatorRule === "deterministic_temporal_score"
  && pageOrderDecision?.proposedBy === "gpt-5.6"
  && pageOrderDecision.targetIds.length > 0
  && primaryWitnessDecisions.length === pageOrderDecision.targetIds.length
  && primaryWitnessDecisions.every((decision) => decision.proposedBy === "gpt-5.6")
  && JSON.stringify(gptDecisionKinds) === JSON.stringify(["page_order", "primary_witness"])
);
const proof = {
  recoveryUrl: `${baseUrl}/r/${recoveryId}`,
  receiptUrl: `${baseUrl}/api/recover/${recoveryId}/receipt`,
  planner: receipt.planner,
  model: receipt.model,
  validations: receipt.validationResults.length,
  failed: failed.length,
  provenancePassed,
  gptDecisionKinds,
  primaryWitnessDecisions: primaryWitnessDecisions.length,
  warnings: persisted?.result?.warnings || [],
  manifestHash: receipt.manifestHash,
};
console.log(JSON.stringify({ proof }));

if (receipt.planner !== "gpt-5.6" || !receipt.model || failed.length || !provenancePassed) {
  throw new Error(`Model proof failed: ${JSON.stringify(proof)}`);
}
