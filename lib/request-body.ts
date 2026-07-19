export async function readBoundedRequestBody(request: Request, maxBytes: number): Promise<string> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new Error("The recovery request body budget is invalid.");
  }

  const declaredHeader = request.headers.get("content-length");
  if (declaredHeader !== null) {
    const declaredLength = Number(declaredHeader);
    if (!/^\d+$/.test(declaredHeader.trim())
      || !Number.isSafeInteger(declaredLength)
      || declaredLength > maxBytes) {
      try {
        await request.body?.cancel();
      } catch {
        // The declared-length rejection remains authoritative.
      }
      throw new Error("The recovery request is too large.");
    }
  }

  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: false });
  const parts: string[] = [];
  let total = 0;
  let completed = false;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        completed = true;
        break;
      }
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) throw new Error("The recovery request is too large.");
      parts.push(decoder.decode(value, { stream: true }));
    }
    parts.push(decoder.decode());
    return parts.join("");
  } finally {
    if (!completed) {
      try {
        await reader.cancel();
      } catch {
        // Preserve the bounded-read failure; body disposal is best effort.
      }
    }
    reader.releaseLock();
  }
}
