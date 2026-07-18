const CLIENT_COOLDOWN_MS = 10 * 60 * 1_000;
const CLIENT_KEY_RETENTION_MS = 24 * 60 * 60 * 1_000;

export const RECOVERY_CLIENT_COOLDOWN_SECONDS = CLIENT_COOLDOWN_MS / 1_000;

type RateLimitDatabase = Pick<D1Database, "prepare">;

export class RecoveryRateLimitError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super("This visitor recently started a recovery. Please wait before starting another.");
    this.name = "RecoveryRateLimitError";
    this.retryAfterSeconds = Math.max(1, Math.ceil(retryAfterSeconds));
  }
}

export function recoveryRateLimitResponse(error: RecoveryRateLimitError) {
  return Response.json(
    { error: error.message },
    {
      status: 429,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": String(error.retryAfterSeconds),
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Cloudflare overwrites CF-Connecting-IP at the edge. Never persist the address:
 * retain only a namespaced one-way digest used for short-lived abuse control.
 * Requests outside Cloudflare deliberately share one fallback bucket instead of
 * trusting spoofable forwarding headers.
 */
export async function recoveryClientKey(
  request: Request,
  secret = process.env.RECOVERY_RATE_LIMIT_SECRET,
): Promise<string> {
  if (!secret || secret.length < 16) {
    throw new Error("RECOVERY_RATE_LIMIT_SECRET must contain at least 16 characters.");
  }
  const connectingIp = request.headers.get("cf-connecting-ip")?.trim().toLowerCase();
  const boundedIdentity = connectingIp && connectingIp.length <= 128 ? connectingIp : "unattributed-client";
  const encoder = new TextEncoder();
  const hmacKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToHex(await crypto.subtle.sign("HMAC", hmacKey, encoder.encode(boundedIdentity)));
}

export function retryAfterSeconds(lastStartedAt: string, now: Date) {
  const elapsed = now.getTime() - Date.parse(lastStartedAt);
  if (!Number.isFinite(elapsed)) return RECOVERY_CLIENT_COOLDOWN_SECONDS;
  return Math.max(1, Math.ceil((CLIENT_COOLDOWN_MS - elapsed) / 1_000));
}

/** Atomically admits one recovery per hashed client key per cooldown window. */
export async function acquireRecoveryClientCooldown(
  d1: RateLimitDatabase,
  clientKeyHash: string,
  now: Date,
) {
  const startedAt = now.toISOString();
  const eligibleBefore = new Date(now.getTime() - CLIENT_COOLDOWN_MS).toISOString();
  const result = await d1.prepare(`INSERT INTO recovery_rate_limits (client_key_hash, last_started_at)
    VALUES (?, ?)
    ON CONFLICT(client_key_hash) DO UPDATE SET
      last_started_at = excluded.last_started_at
    WHERE recovery_rate_limits.last_started_at <= ?`)
    .bind(clientKeyHash, startedAt, eligibleBefore)
    .run();

  if (result.meta.changes !== 1) {
    const existing = await d1.prepare("SELECT last_started_at FROM recovery_rate_limits WHERE client_key_hash = ?")
      .bind(clientKeyHash)
      .first<{ last_started_at: string }>();
    throw new RecoveryRateLimitError(
      existing ? retryAfterSeconds(existing.last_started_at, now) : RECOVERY_CLIENT_COOLDOWN_SECONDS,
    );
  }

  // Bound pseudonymous-key retention independently of recovery-result retention.
  const retentionCutoff = new Date(now.getTime() - CLIENT_KEY_RETENTION_MS).toISOString();
  await d1.prepare("DELETE FROM recovery_rate_limits WHERE last_started_at < ?")
    .bind(retentionCutoff)
    .run();
}
