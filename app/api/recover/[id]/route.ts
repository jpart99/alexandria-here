import { getRecoveryRecord } from "../../../../lib/recovery-store";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return Response.json({ error: "Recovery not found." }, { status: 404 });
  }
  const record = await getRecoveryRecord(id);
  if (!record) return Response.json({ error: "Recovery not found." }, { status: 404 });
  return Response.json(record, {
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
