import assert from "node:assert/strict";
import test from "node:test";
import {
  acquireRecoveryClientCooldown,
  recoveryClientKey,
  RecoveryRateLimitError,
  recoveryRateLimitResponse,
  retryAfterSeconds,
} from "../lib/recovery-rate-limit";

type Row = { last_started_at: string };

function fakeD1(options: { failRetentionDelete?: boolean } = {}) {
  const rows = new Map<string, Row>();
  return {
    rows,
    prepare(sql: string) {
      let bindings: unknown[] = [];
      return {
        bind(...values: unknown[]) {
          bindings = values;
          return this;
        },
        async run() {
          if (sql.startsWith("INSERT INTO recovery_rate_limits")) {
            const [key, startedAt, eligibleBefore] = bindings as string[];
            const current = rows.get(key);
            if (current && current.last_started_at > eligibleBefore) return { meta: { changes: 0 } };
            rows.set(key, { last_started_at: startedAt });
            return { meta: { changes: 1 } };
          }
          if (sql.startsWith("DELETE FROM recovery_rate_limits")) {
            if (options.failRetentionDelete) throw new Error("retention unavailable");
            const [cutoff] = bindings as string[];
            let changes = 0;
            for (const [key, row] of rows) {
              if (row.last_started_at < cutoff) {
                rows.delete(key);
                changes += 1;
              }
            }
            return { meta: { changes } };
          }
          throw new Error(`Unexpected SQL: ${sql}`);
        },
        async first<T>() {
          const [key] = bindings as string[];
          return (rows.get(key) || null) as T | null;
        },
      };
    },
  };
}

test("client recovery keys are stable one-way digests and never expose the address", async () => {
  const secret = "unit-test-rate-limit-secret";
  const first = await recoveryClientKey(new Request("https://app.test", { headers: { "CF-Connecting-IP": "203.0.113.9" } }), secret);
  const repeated = await recoveryClientKey(new Request("https://app.test", { headers: { "CF-Connecting-IP": "203.0.113.9" } }), secret);
  const other = await recoveryClientKey(new Request("https://app.test", { headers: { "CF-Connecting-IP": "203.0.113.10" } }), secret);
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first, repeated);
  assert.notEqual(first, other);
  assert.ok(!first.includes("203.0.113.9"));
});

test("missing edge identity uses one non-spoofable fallback bucket", async () => {
  const secret = "unit-test-rate-limit-secret";
  const forwarded = await recoveryClientKey(new Request("https://app.test", { headers: { "X-Forwarded-For": "1.2.3.4" } }), secret);
  const absent = await recoveryClientKey(new Request("https://app.test"), secret);
  assert.equal(forwarded, absent);
});

test("client hashing fails closed without a deployment secret", async () => {
  await assert.rejects(recoveryClientKey(new Request("https://app.test"), "short"), /at least 16 characters/);
});

test("durable cooldown admits once, reports an honest retry, and admits after expiry", async () => {
  const d1 = fakeD1();
  const now = new Date("2026-07-18T12:00:00.000Z");
  await acquireRecoveryClientCooldown(d1 as unknown as D1Database, "client-a", now);

  await assert.rejects(
    acquireRecoveryClientCooldown(d1 as unknown as D1Database, "client-a", new Date(now.getTime() + 90_000)),
    (error: unknown) => error instanceof RecoveryRateLimitError && error.retryAfterSeconds === 510,
  );

  await assert.doesNotReject(
    acquireRecoveryClientCooldown(d1 as unknown as D1Database, "client-a", new Date(now.getTime() + 600_000)),
  );
});

test("retention housekeeping cannot revoke an already successful cooldown admission", async () => {
  const d1 = fakeD1({ failRetentionDelete: true });
  const now = new Date("2026-07-18T12:00:00.000Z");
  await assert.doesNotReject(acquireRecoveryClientCooldown(d1 as unknown as D1Database, "client-a", now));
  assert.equal(d1.rows.get("client-a")?.last_started_at, now.toISOString());
  await assert.rejects(
    acquireRecoveryClientCooldown(d1 as unknown as D1Database, "client-a", new Date(now.getTime() + 60_000)),
    (error: unknown) => error instanceof RecoveryRateLimitError && error.retryAfterSeconds === 540,
  );
});

test("retry calculation fails closed for corrupt timestamps", () => {
  assert.equal(retryAfterSeconds("not-a-date", new Date()), 600);
});

test("rate-limit admission returns an honest non-cacheable 429", async () => {
  const response = recoveryRateLimitResponse(new RecoveryRateLimitError(509.2));
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "510");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    error: "This visitor recently started a recovery. Please wait before starting another.",
  });
});
