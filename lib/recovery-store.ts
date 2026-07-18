import { desc, eq } from "drizzle-orm";
import { getD1, getDb } from "../db";
import { recoveries } from "../db/schema";
import type { RecoveryResult, RecoveryStage } from "./domain";
import { serializePersistedRecovery } from "./persistence-budget";
import { hydrateRecoveryRecord } from "./recovery-compat";

let initialized = false;
const RECOVERY_LOCK_ID = 1;
const RECOVERY_LOCK_TTL_MS = 15 * 60 * 1_000;

export class RecoveryBusyError extends Error {
  constructor() {
    super("Another witnessed recovery is already in progress. Please try again when it finishes.");
    this.name = "RecoveryBusyError";
  }
}

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
  ]);
  initialized = true;
}

async function acquireRecoveryLock(recoveryId: string, acquiredAt: string) {
  const staleBefore = new Date(Date.parse(acquiredAt) - RECOVERY_LOCK_TTL_MS).toISOString();
  const result = await getD1().prepare(`INSERT INTO recovery_lock (id, recovery_id, acquired_at)
    VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      recovery_id = excluded.recovery_id,
      acquired_at = excluded.acquired_at
    WHERE recovery_lock.acquired_at < ?`)
    .bind(RECOVERY_LOCK_ID, recoveryId, acquiredAt, staleBefore)
    .run();
  if (result.meta.changes !== 1) throw new RecoveryBusyError();
}

async function releaseRecoveryLock(recoveryId: string) {
  await getD1().prepare("DELETE FROM recovery_lock WHERE id = ? AND recovery_id = ?")
    .bind(RECOVERY_LOCK_ID, recoveryId)
    .run();
}

export async function createRecoveryRecord(id: string, submittedUrl: string, normalizedUrl: string) {
  await ensureRecoverySchema();
  const now = new Date().toISOString();
  await acquireRecoveryLock(id, now);
  try {
    await getDb().insert(recoveries).values({
      id,
      submittedUrl,
      normalizedUrl,
      status: "running",
      stage: "finding_captures",
      detail: "Validating the address and asking the public archive for surviving captures.",
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    await releaseRecoveryLock(id);
    throw error;
  }
  return now;
}

export async function updateRecoveryStage(id: string, stage: RecoveryStage, detail: string) {
  await ensureRecoverySchema();
  await getDb().update(recoveries).set({
    stage,
    status: stage === "failed" ? "failed" : stage === "complete" ? "complete" : "running",
    detail,
    updatedAt: new Date().toISOString(),
  }).where(eq(recoveries.id, id));
}

export async function completeRecovery(id: string, result: RecoveryResult) {
  await ensureRecoverySchema();
  const resultJson = serializePersistedRecovery(result);
  await getDb().update(recoveries).set({
    stage: "complete",
    status: "complete",
    detail: "The witnessed restoration is ready.",
    resultJson,
    updatedAt: new Date().toISOString(),
  }).where(eq(recoveries.id, id));
  await releaseRecoveryLock(id);
}

export async function failRecovery(id: string, error: string) {
  await ensureRecoverySchema();
  await getDb().update(recoveries).set({
    stage: "failed",
    status: "failed",
    detail: "The recovery could not be completed.",
    error,
    updatedAt: new Date().toISOString(),
  }).where(eq(recoveries.id, id));
  await releaseRecoveryLock(id);
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
