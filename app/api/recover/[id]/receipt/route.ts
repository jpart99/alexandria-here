import { recoveryNotFoundResponse } from "../../../../../lib/recovery-http";
import { isRecoveryId } from "../../../../../lib/recovery-id";
import { getRecoveryRecord } from "../../../../../lib/recovery-store";
import { createReceiptResponse } from "../../../../../lib/receipt-response";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isRecoveryId(id)) return recoveryNotFoundResponse();
  const record = await getRecoveryRecord(id);

  if (!record) return recoveryNotFoundResponse();

  return createReceiptResponse(record.result, id);
}
