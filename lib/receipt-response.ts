import type { RecoveryResult } from "./domain";

export function createReceiptResponse(result: RecoveryResult | null, id: string): Response {
  if (!result?.receipt) {
    return Response.json(
      { error: "The recovery receipt is not available yet." },
      { status: 409, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } },
    );
  }

  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "") || "recovery";
  return new Response(`${JSON.stringify(result.receipt, null, 2)}\n`, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="alexandria-recovery-${safeId}-receipt.json"`,
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
