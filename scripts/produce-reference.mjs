const baseUrl = new URL(process.env.ALEXANDRIA_BASE_URL || "http://localhost:3000");
const targetUrl = process.env.ALEXANDRIA_REFERENCE_URL;
const configuredPath = process.env.NEXT_PUBLIC_REFERENCE_RECOVERY_PATH || "";
const recoveryPathPattern = /^\/r\/([0-9a-f]{8}-[0-9a-f-]{27})$/i;

if (!targetUrl) {
  throw new Error("Set ALEXANDRIA_REFERENCE_URL to the real public target to recover.");
}

function normalizedTarget(value) {
  const url = new URL(value);
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  if (!url.pathname) url.pathname = "/";
  return url.toString();
}

referenceRecovery: {
  const configuredMatch = configuredPath.match(recoveryPathPattern);
  if (configuredMatch) {
    const recordResponse = await fetch(new URL(`/api/recover/${configuredMatch[1]}`, baseUrl));
    if (recordResponse.ok) {
      const record = await recordResponse.json();
      let storedResult = null;
      try {
        storedResult = typeof record.resultJson === "string" ? JSON.parse(record.resultJson) : record.result || null;
      } catch {
        storedResult = null;
      }
      if (record.status === "complete" && storedResult && record.normalizedUrl === normalizedTarget(targetUrl)) {
        console.log(`Reference recovery already exists: ${new URL(configuredPath, baseUrl)}`);
        console.log(`NEXT_PUBLIC_REFERENCE_RECOVERY_PATH=${configuredPath}`);
        break referenceRecovery;
      }
    }
  }

  const response = await fetch(new URL("/api/recover", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: targetUrl }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Reference recovery failed to start (${response.status}).`);
  }

  const events = (await response.text())
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const failure = events.find((event) => event.stage === "failed");
  if (failure) throw new Error(failure.detail || "Reference recovery failed.");
  const completed = events.findLast((event) => event.completed && event.resultPath);
  if (!completed || !recoveryPathPattern.test(completed.resultPath)) {
    throw new Error("Reference recovery completed without a stable result path.");
  }

  const atlasResponse = await fetch(new URL(completed.resultPath, baseUrl));
  if (!atlasResponse.ok) throw new Error(`The new reference Atlas did not resolve (${atlasResponse.status}).`);

  console.log(`Reference recovery created through the public pipeline: ${new URL(completed.resultPath, baseUrl)}`);
  console.log(`NEXT_PUBLIC_REFERENCE_RECOVERY_PATH=${completed.resultPath}`);
}
