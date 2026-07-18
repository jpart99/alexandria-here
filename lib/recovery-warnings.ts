import type { RecoveryReceiptWarning, RecoveryReceiptWarningOccurrence } from "./domain";

export type ReceiptWarningInput = {
  raw: string;
  occurrence: RecoveryReceiptWarningOccurrence;
};

export function aggregateRecoveryWarnings(...groups: ReadonlyArray<readonly string[]>): string[] {
  const seen = new Set<string>();
  const aggregate: string[] = [];
  for (const group of groups) {
    for (const warning of group) {
      if (seen.has(warning)) continue;
      seen.add(warning);
      aggregate.push(warning);
    }
  }
  return aggregate;
}

export function modelFallbackWarning(error: unknown): string {
  const record = typeof error === "object" && error !== null
    ? error as Record<string, unknown>
    : null;
  const status = typeof record?.status === "number" ? record.status : null;
  const name = typeof record?.name === "string" ? record.name.toLowerCase() : "";
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  let reason = "provider_error";
  if (name === "aborterror" || /\babort(?:ed)?\b/.test(message)) reason = "request_aborted";
  else if (/timeout|timed out/.test(message)) reason = "timeout";
  else if (status === 429 || /rate limit|quota/.test(message)) reason = "rate_limited";
  else if (status === 401 || status === 403 || /authentication|api key|unauthorized|forbidden/.test(message)) reason = "authentication_failed";
  else if ((status !== null && status >= 500) || /service unavailable|provider unavailable|upstream/.test(message)) reason = "provider_unavailable";
  else if (/refus/.test(message)) reason = "refusal";
  else if (/incomplete/.test(message)) reason = "incomplete_response";
  else if (/openai_model|gpt-5\.6 family/.test(message)) reason = "invalid_configuration";
  else if (/structured|schema|valid .*plan|planner|pageorder|primarywitness|unsupported|invented|omitted|duplicate|override|navigation/.test(message)) reason = "invalid_model_plan";
  return `model_fallback:${reason}`;
}

function warningCategory(raw: string): RecoveryReceiptWarning["category"] {
  if (raw.startsWith("capture_failed:")) return "capture_failure";
  if (raw.startsWith("model_fallback:")) return "model_fallback";
  if (["block_limit_reached", "missing_title", "no_readable_body_blocks"].includes(raw)) return "extraction";
  return "other";
}

export function buildReceiptWarnings(inputs: readonly ReceiptWarningInput[]): RecoveryReceiptWarning[] {
  const warningsByRaw = new Map<string, RecoveryReceiptWarning>();
  const occurrenceKeysByRaw = new Map<string, Set<string>>();
  for (const input of inputs) {
    if (!input.raw) continue;
    let warning = warningsByRaw.get(input.raw);
    if (!warning) {
      warning = { raw: input.raw, category: warningCategory(input.raw), occurrences: [] };
      warningsByRaw.set(input.raw, warning);
      occurrenceKeysByRaw.set(input.raw, new Set());
    }
    const occurrenceKey = JSON.stringify([
      input.occurrence.scope,
      input.occurrence.captureId || null,
      input.occurrence.sourceId || null,
      input.occurrence.blockId || null,
    ]);
    const occurrenceKeys = occurrenceKeysByRaw.get(input.raw)!;
    if (occurrenceKeys.has(occurrenceKey)) continue;
    occurrenceKeys.add(occurrenceKey);
    warning.occurrences.push(input.occurrence);
  }
  return [...warningsByRaw.values()];
}
