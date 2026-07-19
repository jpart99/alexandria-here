process.env.ALEXANDRIA_BASE_URL = "https://alexandria-here.cinemaexile.chatgpt.site";
process.env.ALEXANDRIA_REFERENCE_RECOVERY_PATH = "/r/18026989-33be-4011-86ee-19e1754cb22c";
process.env.ALEXANDRIA_REQUIRE_EXACT_REFERENCE_PROOF = "1";

await import("./production-smoke.mjs");

const { assertExactPathfinderProof, EXACT_PATHFINDER_PROOF } = await import("./submission-proof-contract.mjs");
const origin = process.env.ALEXANDRIA_BASE_URL;
const recoveryId = EXACT_PATHFINDER_PROOF.recoveryId;
const request = (pathname, accept) => fetch(`${origin}${pathname}`, {
  headers: { accept },
  redirect: "manual",
  signal: AbortSignal.timeout(20_000),
});
const readBounded = async (response, maximumBytes) => {
  if (!response.body) return Buffer.alloc(0);
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    await response.body.cancel("Pathfinder live proof response exceeds its declared limit");
    throw new Error(`Pathfinder live proof response declared ${declaredLength} bytes; limit is ${maximumBytes}.`);
  }
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximumBytes) {
        await reader.cancel("Pathfinder live proof response exceeds its streamed limit");
        throw new Error(`Pathfinder live proof response exceeded the ${maximumBytes}-byte streamed limit.`);
      }
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    await reader.cancel("Pathfinder live proof read failed").catch(() => undefined);
    throw error;
  }
  return Buffer.concat(chunks, length);
};
const readJson = async (pathname) => {
  const response = await request(pathname, "application/json");
  if (!response.ok) throw new Error(`Pathfinder live proof failed at ${pathname}: HTTP ${response.status}.`);
  if (!/^application\/json(?:;|$)/iu.test(response.headers.get("content-type") || "")) {
    await response.body?.cancel("Pathfinder live proof rejected a non-JSON response");
    throw new Error(`Pathfinder live proof received the wrong media type at ${pathname}.`);
  }
  return JSON.parse((await readBounded(response, 2_000_000)).toString("utf8"));
};
const readReturnedSite = async () => {
  const pathname = `/r/${recoveryId}`;
  const response = await request(pathname, "text/html");
  if (!response.ok) throw new Error(`Pathfinder returned site failed at ${pathname}: HTTP ${response.status}.`);
  if (!/^text\/html(?:;|$)/iu.test(response.headers.get("content-type") || "")) {
    await response.body?.cancel("Pathfinder live proof rejected a non-HTML returned site");
    throw new Error("Pathfinder returned site lost its HTML media type.");
  }
  if (response.headers.get("x-alexandria-worker-route") !== "app-worker-v1") {
    await response.body?.cancel("Pathfinder live proof rejected an unmarked application route");
    throw new Error("Pathfinder returned site did not traverse the Alexandria application Worker.");
  }
  const html = (await readBounded(response, 2_000_000)).toString("utf8");
  if (html.length < 1_000 || !html.includes("Mars Pathfinder")) {
    throw new Error("Pathfinder returned site did not expose its witnessed title in bounded HTML.");
  }
  return { pathname, status: response.status, bytes: Buffer.byteLength(html), workerRoute: "app-worker-v1" };
};
const [returnedSite, record, receipt] = await Promise.all([
  readReturnedSite(),
  readJson(`/api/recover/${recoveryId}`),
  readJson(`/api/recover/${recoveryId}/receipt`),
]);
console.log(JSON.stringify({
  check: "exact Pathfinder presentation proof",
  returnedSite,
  proof: assertExactPathfinderProof({ record, receipt, recoveryId }),
}, null, 2));
