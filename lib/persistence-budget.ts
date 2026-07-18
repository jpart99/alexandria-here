// D1 limits an individual row/BLOB/string to 2,000,000 bytes. Keep enough
// headroom for SQLite/D1 implementation details and fail with Alexandria's
// honest terminal state instead of an opaque database write error.
export const MAX_PERSISTED_RECOVERY_BYTES = 1_800_000;

export function serializePersistedRecovery(value: unknown): string {
  const serialized = JSON.stringify(value);
  const bytes = new TextEncoder().encode(serialized).byteLength;
  if (bytes > MAX_PERSISTED_RECOVERY_BYTES) {
    throw new Error("The surviving evidence exceeded this recovery's durable storage budget.");
  }
  return serialized;
}
