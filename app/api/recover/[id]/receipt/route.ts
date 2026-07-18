import { getRecoveryRecord } from "../../../../../lib/recovery-store";
import { createReceiptResponse } from "../../../../../lib/receipt-response";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const record = await getRecoveryRecord(id);

  if (!record) {
    return Response.json({ error: "Recovery not found." }, { status: 404 });
  }

  return createReceiptResponse(record.result, id);
}
