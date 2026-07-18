const baseUrl = (process.env.ALEXANDRIA_BASE_URL || "http://127.0.0.1:3100").replace(/\/$/, "");
const activeTarget = process.env.ALEXANDRIA_MATRIX_ACTIVE_URL || "http://www.911commission.gov/";
const insufficientTarget = process.env.ALEXANDRIA_MATRIX_INSUFFICIENT_URL
  || "http://info.cern.ch/hypertext/WWW/TheProject.html";
const parsedBaseUrl = new URL(baseUrl);
if (!["127.0.0.1", "localhost", "[::1]"].includes(parsedBaseUrl.hostname)) {
  throw new Error("The destructive failure matrix is loopback-only. Use the production smoke checks for hosted releases.");
}

const MATRIX_CLIENTS = {
  active: "198.51.100.10",
  concurrent: "198.51.100.11",
  disconnect: "198.51.100.12",
  insufficient: "198.51.100.13",
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function recoveryRequest(url, signal, clientAddress = MATRIX_CLIENTS.active) {
  return fetch(`${baseUrl}/api/recover`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // Cloudflare overwrites this header at the edge. The loopback-only matrix
      // uses reserved TEST-NET addresses to exercise independent client buckets.
      "cf-connecting-ip": clientAddress,
    },
    body: JSON.stringify({ url }),
    signal,
  });
}

async function pollRecord(id, predicate, attempts = 40) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await fetch(`${baseUrl}/api/recover/${id}`);
    assert(response.ok, `Persisted recovery ${id} returned ${response.status}.`);
    const record = await response.json();
    if (predicate(record)) return record;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Persisted recovery ${id} did not reach the expected state.`);
}

const results = [];
async function requestWithWorkerRetry(factory) {
  let response = await factory();
  if (response.status !== 503) return response;
  const body = await response.text();
  if (!/worker restarted mid-request/i.test(body)) {
    return new Response(body, { status: response.status, headers: response.headers });
  }
  // Wrangler can reload workerd once while its local binding graph settles.
  // That is preview orchestration, not an Alexandria response; retry it once.
  await new Promise((resolve) => setTimeout(resolve, 250));
  response = await factory();
  return response;
}

async function expectStatus(name, requestFactory, expected) {
  const response = await requestWithWorkerRetry(requestFactory);
  const body = await response.text();
  assert(response.status === expected, `${name}: expected ${expected}, received ${response.status}: ${body.slice(0, 200)}`);
  results.push({ name, status: response.status, result: "pass" });
  return { response, body };
}

async function assertDirectPreviewReachability(stage) {
  const response = await fetch(`${baseUrl}/`, { redirect: "manual" });
  assert(response.status === 200, `Compiled preview was not reachable ${stage}: HTTP ${response.status}.`);
  await response.body?.cancel();
}

await expectStatus("unsupported request content type", () => fetch(`${baseUrl}/api/recover`, {
  method: "POST",
  headers: { "content-type": "text/plain" },
  body: "not json",
}), 415);

await expectStatus("oversized request body", () => fetch(`${baseUrl}/api/recover`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ url: `https://public.example.com/${"x".repeat(5_000)}` }),
}), 400);

await expectStatus("unsafe submitted URL", () => recoveryRequest("http://127.0.0.1/"), 400);

const activePromise = requestWithWorkerRetry(() => recoveryRequest(activeTarget, undefined, MATRIX_CLIENTS.active));
await new Promise((resolve) => setTimeout(resolve, 50));
await expectStatus("singleton concurrent recovery", () => recoveryRequest(activeTarget, undefined, MATRIX_CLIENTS.concurrent), 409);
const active = await activePromise;
assert(active.status === 200 && active.body, `Active recovery could not begin: ${active.status} ${await active.text()}`);
const activeId = active.headers.get("x-recovery-id");
assert(activeId, "Active recovery omitted X-Recovery-Id.");
const activeRecord = await pollRecord(activeId, (record) => record.status !== "running");
assert(activeRecord.status === "complete", `Active control recovery ended as ${activeRecord.status}.`);
const completedReceipt = await fetch(`${baseUrl}/api/recover/${activeId}/receipt`);
assert(completedReceipt.status === 200, `Completed receipt returned ${completedReceipt.status}.`);
JSON.parse(await completedReceipt.text());
results.push({ name: "completed receipt availability", status: completedReceipt.status, result: "pass" });
await expectStatus(
  "per-client recovery cooldown",
  () => recoveryRequest(activeTarget, undefined, MATRIX_CLIENTS.active),
  429,
);

const disconnectAbort = new AbortController();
const disconnectPromise = recoveryRequest(activeTarget, disconnectAbort.signal, MATRIX_CLIENTS.disconnect);
const disconnectSafety = setTimeout(
  () => disconnectAbort.abort(new Error("failure-matrix disconnect safety timeout")),
  2_000,
);
let disconnectedId = "";
try {
  const response = await disconnectPromise;
  assert(response.status === 200, `Disconnect probe could not begin: HTTP ${response.status}.`);
  disconnectedId = response.headers.get("x-recovery-id") || "";
  assert(disconnectedId, "Disconnect probe omitted X-Recovery-Id.");
  assert(response.body, "Disconnect probe returned no response body.");
  const reader = response.body.getReader();
  const firstEvent = await reader.read();
  assert(!firstEvent.done, "Disconnect probe stream closed before its first persisted stage.");
  await reader.cancel("failure-matrix disconnect");
} catch (error) {
  throw new Error(`Disconnect probe failed before a live stream could be cancelled: ${String(error)}`);
} finally {
  clearTimeout(disconnectSafety);
}

const terminalAfterDisconnect = await pollRecord(
  disconnectedId,
  (record) => record.status !== "running",
  64,
);
assert(terminalAfterDisconnect.status === "failed", `Disconnect recovery ended as ${terminalAfterDisconnect.status}.`);
assert(
  /connection closed before verification finished/i.test(terminalAfterDisconnect.error || ""),
  `Disconnect persisted the wrong terminal reason: ${terminalAfterDisconnect.error || "none"}`,
);

// These probes deliberately bypass the one-time Wrangler startup retry. They
// prove direct preview reachability at both historical crash boundaries.
await assertDirectPreviewReachability("after disconnect cleanup");

let insufficient;
for (let attempt = 0; attempt < 64; attempt += 1) {
  const candidate = await requestWithWorkerRetry(() => recoveryRequest(insufficientTarget, undefined, MATRIX_CLIENTS.insufficient));
  if (candidate.status === 200) {
    insufficient = candidate;
    break;
  }
  const body = await candidate.text();
  assert(candidate.status === 409, `Post-disconnect recovery returned ${candidate.status}: ${body.slice(0, 200)}`);
  await new Promise((resolve) => setTimeout(resolve, 250));
}
assert(insufficient, "Client disconnect did not release the recovery lock within 16 seconds.");
results.push({
  name: "client disconnect cleanup",
  status: "lock_released",
  mode: "disconnect_propagated",
  result: "pass",
});
assert(insufficient.status === 200, `Post-disconnect recovery remained locked: ${insufficient.status}`);
const insufficientId = insufficient.headers.get("x-recovery-id");
assert(insufficientId, "Insufficient-evidence recovery omitted X-Recovery-Id.");
await insufficient.text();
const completed = await pollRecord(insufficientId, (record) => record.status === "complete", 20);
assert(
  completed.result?.outcome === "insufficient_evidence",
  `Expected live insufficient_evidence, received ${completed.result?.outcome || completed.status}.`,
);
assert(completed.result?.manifest?.insufficientReason, "Live insufficient-evidence result omitted its reason.");
results.push({ name: "live insufficient-evidence outcome", status: completed.result.outcome, result: "pass" });
await assertDirectPreviewReachability("after the final live recovery");

console.log(JSON.stringify({ baseUrl, results, liveRecoveryPath: `/r/${insufficientId}` }, null, 2));
