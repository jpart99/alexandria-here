import { desc, eq } from "drizzle-orm";
import { getD1, getDb } from "../db";
import { recoveries } from "../db/schema";
import type { RecoveryResult, RecoveryStage } from "./domain";
import { serializePersistedRecovery } from "./persistence-budget";
import { hydrateRecoveryRecord } from "./recovery-compat";
import { acquireRecoveryClientCooldown } from "./recovery-rate-limit";
import {
  admitRunningRecovery,
  cleanupRejectedAdmission,
  persistCompletedRecoveryWithLease,
  persistFailedRecoveryWithLease,
  persistRecoveryStageWithLease,
  RecoveryBusyError,
  RecoveryIdCollisionError,
  RecoveryLeaseLostError,
  RecoveryPersistenceError,
  recoveryIdExists,
} from "./recovery-lease";

let initialized = false;

export { RecoveryBusyError, RecoveryIdCollisionError, RecoveryLeaseLostError, RecoveryPersistenceError };

export async function ensureRecoverySchema() {
  if (initialized) return;
  const d1 = getD1();
  await d1.batch([
    d1.prepare(`CREATE TABLE IF NOT EXISTS recoveries (
      id TEXT PRIMARY KEY,
      submitted_url TEXT NOT NULL,
      normalized_url TEXT NOT NULL,
      status TEXT NOT NULL,
      stage TEXT NOT NULL,
      detail TEXT,
      result_json TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    d1.prepare("CREATE INDEX IF NOT EXISTS recoveries_created_at_idx ON recoveries(created_at)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS recoveries_normalized_url_idx ON recoveries(normalized_url)"),
    d1.prepare(`CREATE TABLE IF NOT EXISTS recovery_lock (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      recovery_id TEXT NOT NULL,
      acquired_at TEXT NOT NULL
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS recovery_rate_limits (
      client_key_hash TEXT PRIMARY KEY,
      last_started_at TEXT NOT NULL
    )`),
    d1.prepare("CREATE INDEX IF NOT EXISTS recovery_rate_limits_started_at_idx ON recovery_rate_limits(last_started_at)"),
  ]);
  initialized = true;
}

export async function createRecoveryRecord(id: string, submittedUrl: string, normalizedUrl: string, clientKeyHash: string) {
  await ensureRecoverySchema();
  const d1 = getD1();
  const now = new Date().toISOString();
  // The recovery UUID is also the lease fencing owner. Reject an existing ID
  // before touching the singleton so an astronomically unlikely UUID reuse
  // cannot renew or release another recovery's lease (the ABA case).
  if (await recoveryIdExists(d1, id)) throw new RecoveryIdCollisionError();
  let admitted = false;
  try {
    await admitRunningRecovery(d1, {
      id,
      submittedUrl,
      normalizedUrl,
      createdAt: now,
    });
    admitted = true;
    await acquireRecoveryClientCooldown(d1, clientKeyHash, new Date(now));
  } catch (error) {
    if (admitted) {
      await cleanupRejectedAdmission(d1, id, now);
    }
    throw error;
  }
  return now;
}

export async function updateRecoveryStage(id: string, stage: RecoveryStage, detail: string) {
  await ensureRecoverySchema();
  await persistRecoveryStageWithLease(getD1(), id, stage, detail, new Date().toISOString());
}

export async function completeRecovery(id: string, result: RecoveryResult) {
  await ensureRecoverySchema();
  const resultJson = serializePersistedRecovery(result);
  await persistCompletedRecoveryWithLease(getD1(), id, resultJson, new Date().toISOString());
}

export async function failRecovery(id: string, error: string) {
  await ensureRecoverySchema();
  await persistFailedRecoveryWithLease(getD1(), id, error, new Date().toISOString());
}

export async function getRecoveryRecord(id: string) {
  await ensureRecoverySchema();
  const [record] = await getDb().select().from(recoveries).where(eq(recoveries.id, id)).limit(1);
  if (!record) return null;
  // Never expose the raw serialized column alongside the parsed result. Apart
  // from being an internal storage detail, it approximately doubled completed
  // polling responses and made stale clients retain two full evidence packets.
  return hydrateRecoveryRecord(record);
}

export async function listRecentRecoveries(limit = 6) {
  await ensureRecoverySchema();
  return getDb().select({
    id: recoveries.id,
    normalizedUrl: recoveries.normalizedUrl,
    status: recoveries.status,
    stage: recoveries.stage,
    createdAt: recoveries.createdAt,
  }).from(recoveries).orderBy(desc(recoveries.createdAt)).limit(limit);
}
