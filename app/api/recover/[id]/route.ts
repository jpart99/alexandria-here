import { recoveryNotFoundResponse } from "../../../../lib/recovery-http";
import { isRecoveryId } from "../../../../lib/recovery-id";
import { getRecoveryRecord } from "../../../../lib/recovery-store";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isRecoveryId(id)) return recoveryNotFoundResponse();
  const record = await getRecoveryRecord(id);
  if (!record) return recoveryNotFoundResponse();
  return Response.json(record, {
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
