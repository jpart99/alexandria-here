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

if (!recoveryId || !completed) {
  throw new Error("Recovery stream ended without a completed recovery ID.");
}

const receiptResponse = await fetch(`${baseUrl}/api/recover/${encodeURIComponent(recoveryId)}/receipt`);
if (!receiptResponse.ok) {
  throw new Error(`Receipt fetch failed (${receiptResponse.status}): ${await receiptResponse.text()}`);
}
const receipt = await receiptResponse.json();
const failed = receipt.validationResults.filter((check) => !check.passed);
const proof = {
  recoveryUrl: `${baseUrl}/r/${recoveryId}`,
  receiptUrl: `${baseUrl}/api/recover/${recoveryId}/receipt`,
  planner: receipt.planner,
  model: receipt.model,
  validations: receipt.validationResults.length,
  failed: failed.length,
  manifestHash: receipt.manifestHash,
};
console.log(JSON.stringify({ proof }));

if (receipt.planner !== "gpt-5.6" || !receipt.model || failed.length) {
  throw new Error(`Model proof failed: ${JSON.stringify(proof)}`);
}
