import type { RecoveryStage } from "./domain";

export const RECOVERY_LEASE_TTL_MS = 15 * 60 * 1_000;
const RECOVERY_LOCK_ID = 1;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1_000;
const ABANDONED_RECOVERY_ERROR = "The recovery lease expired before verification finished.";

type RunningRecovery = {
  id: string;
  submittedUrl: string;
  normalizedUrl: string;
  createdAt: string;
};

function changes(result: D1Result<unknown>) {
  return Number(result.meta.changes || 0);
}

function leaseWindow(acquiredAt: string) {
  const acquiredTime = Date.parse(acquiredAt);
  if (!Number.isFinite(acquiredTime)) throw new Error("Recovery lease timestamp is invalid.");
  return {
    staleBefore: new Date(acquiredTime - RECOVERY_LEASE_TTL_MS).toISOString(),
    futureAfter: new Date(acquiredTime + MAX_CLOCK_SKEW_MS).toISOString(),
  };
}

export class RecoveryBusyError extends Error {
  constructor() {
    super("Another witnessed recovery is already in progress. Please try again when it finishes.");
    this.name = "RecoveryBusyError";
  }
}

export class RecoveryLeaseLostError extends Error {
  constructor() {
    super("The recovery lease was lost before persisted verification finished.");
    this.name = "RecoveryLeaseLostError";
  }
}

export class RecoveryPersistenceError extends Error {
  constructor() {
    super("The recovery state could not be persisted under its active lease.");
    this.name = "RecoveryPersistenceError";
  }
}

export class RecoveryIdCollisionError extends Error {
  constructor() {
    super("A recovery identifier collision was detected before admission.");
    this.name = "RecoveryIdCollisionError";
  }
}

/**
 * Production admission is one D1 transaction: no other request can observe a
 * fresh lease without its running row and mistake it for an orphan. The insert
 * is conditional on the exact lease heartbeat written by this batch.
 */
export async function admitRunningRecovery(d1: D1Database, recovery: RunningRecovery) {
  const { staleBefore, futureAfter } = leaseWindow(recovery.createdAt);
  const [lease, , row] = await d1.batch([
    d1.prepare(`INSERT INTO recovery_lock (id, recovery_id, acquired_at)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        recovery_id = excluded.recovery_id,
        acquired_at = excluded.acquired_at
      WHERE julianday(recovery_lock.acquired_at) IS NULL
        OR recovery_lock.acquired_at < ?
        OR recovery_lock.acquired_at > ?
        OR NOT EXISTS (
          SELECT 1 FROM recoveries
          WHERE id = recovery_lock.recovery_id AND status = 'running'
        )`)
      .bind(RECOVERY_LOCK_ID, recovery.id, recovery.createdAt, staleBefore, futureAfter),
    d1.prepare(`UPDATE recoveries SET
        stage = 'failed',
        status = 'failed',
        detail = 'The recovery could not be completed.',
        error = ?,
        updated_at = ?
      WHERE status = 'running'
        AND id <> ?
        AND EXISTS (
          SELECT 1 FROM recovery_lock
          WHERE id = ? AND recovery_id = ? AND acquired_at = ?
        )`)
      .bind(
        ABANDONED_RECOVERY_ERROR,
        recovery.createdAt,
        recovery.id,
        RECOVERY_LOCK_ID,
        recovery.id,
        recovery.createdAt,
      ),
    d1.prepare(`INSERT INTO recoveries (
        id, submitted_url, normalized_url, status, stage, detail, created_at, updated_at
      )
      SELECT ?, ?, ?, 'running', 'finding_captures', ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM recovery_lock
        WHERE id = ? AND recovery_id = ? AND acquired_at = ?
      )
      ON CONFLICT(id) DO NOTHING`)
      .bind(
        recovery.id,
        recovery.submittedUrl,
        recovery.normalizedUrl,
        "Validating the address and asking the public archive for surviving captures.",
        recovery.createdAt,
        recovery.createdAt,
        RECOVERY_LOCK_ID,
        recovery.id,
        recovery.createdAt,
      ),
  ]);
  if (changes(lease) !== 1) throw new RecoveryBusyError();
  if (changes(row) !== 1) {
    await releaseRecoveryLease(d1, recovery.id);
    throw new RecoveryIdCollisionError();
  }
}

export async function releaseRecoveryLease(d1: D1Database, recoveryId: string) {
  await d1.prepare("DELETE FROM recovery_lock WHERE id = ? AND recovery_id = ?")
    .bind(RECOVERY_LOCK_ID, recoveryId)
    .run();
}

export async function recoveryIdExists(d1: D1Database, recoveryId: string) {
  return Boolean(await d1.prepare("SELECT id FROM recoveries WHERE id = ? LIMIT 1")
    .bind(recoveryId)
    .first<{ id: string }>());
}

export async function cleanupRejectedAdmission(
  d1: D1Database,
  recoveryId: string,
  acquiredAt: string,
) {
  await d1.batch([
    d1.prepare(`DELETE FROM recoveries
      WHERE id = ? AND status = 'running' AND result_json IS NULL
        AND EXISTS (
          SELECT 1 FROM recovery_lock
          WHERE id = ? AND recovery_id = ? AND acquired_at = ?
        )`)
      .bind(recoveryId, RECOVERY_LOCK_ID, recoveryId, acquiredAt),
    d1.prepare(`DELETE FROM recovery_lock
      WHERE id = ? AND recovery_id = ? AND acquired_at = ?
        AND NOT EXISTS (
          SELECT 1 FROM recoveries WHERE id = ? AND status = 'running'
        )`)
      .bind(RECOVERY_LOCK_ID, recoveryId, acquiredAt, recoveryId),
  ]);
}

async function cleanOrphanedLease(d1: D1Database, recoveryId: string) {
  await d1.prepare(`DELETE FROM recovery_lock
      WHERE id = ? AND recovery_id = ?
        AND NOT EXISTS (
          SELECT 1 FROM recoveries WHERE id = ? AND status = 'running'
        )`)
    .bind(RECOVERY_LOCK_ID, recoveryId, recoveryId)
    .run();
}

export async function persistRecoveryStageWithLease(
  d1: D1Database,
  recoveryId: string,
  stage: RecoveryStage,
  detail: string,
  updatedAt: string,
) {
  const { staleBefore, futureAfter } = leaseWindow(updatedAt);
  const [lease, row] = await d1.batch([
    d1.prepare(`UPDATE recovery_lock SET acquired_at = ?
      WHERE id = ? AND recovery_id = ?
        AND julianday(acquired_at) IS NOT NULL
        AND acquired_at >= ? AND acquired_at <= ?
        AND EXISTS (
          SELECT 1 FROM recoveries WHERE id = ? AND status = 'running'
        )`)
      .bind(updatedAt, RECOVERY_LOCK_ID, recoveryId, staleBefore, futureAfter, recoveryId),
    d1.prepare(`UPDATE recoveries SET
        stage = ?, status = 'running', detail = ?, updated_at = ?
      WHERE id = ? AND status = 'running'
        AND EXISTS (
          SELECT 1 FROM recovery_lock
          WHERE id = ? AND recovery_id = ? AND acquired_at = ?
        )`)
      .bind(stage, detail, updatedAt, recoveryId, RECOVERY_LOCK_ID, recoveryId, updatedAt),
  ]);
  if (changes(lease) !== 1) {
    await cleanOrphanedLease(d1, recoveryId);
    throw new RecoveryLeaseLostError();
  }
  if (changes(row) !== 1) {
    await releaseRecoveryLease(d1, recoveryId);
    throw new RecoveryPersistenceError();
  }
}

export async function persistCompletedRecoveryWithLease(
  d1: D1Database,
  recoveryId: string,
  resultJson: string,
  updatedAt: string,
) {
  const { staleBefore, futureAfter } = leaseWindow(updatedAt);
  const [lease, row] = await d1.batch([
    d1.prepare(`UPDATE recovery_lock SET acquired_at = ?
      WHERE id = ? AND recovery_id = ?
        AND julianday(acquired_at) IS NOT NULL
        AND acquired_at >= ? AND acquired_at <= ?
        AND EXISTS (
          SELECT 1 FROM recoveries WHERE id = ? AND status = 'running'
        )`)
      .bind(updatedAt, RECOVERY_LOCK_ID, recoveryId, staleBefore, futureAfter, recoveryId),
    d1.prepare(`UPDATE recoveries SET
        stage = 'complete',
        status = 'complete',
        detail = 'The witnessed restoration is ready.',
        result_json = ?,
        updated_at = ?
      WHERE id = ? AND status = 'running'
        AND EXISTS (
          SELECT 1 FROM recovery_lock
          WHERE id = ? AND recovery_id = ? AND acquired_at = ?
        )`)
      .bind(resultJson, updatedAt, recoveryId, RECOVERY_LOCK_ID, recoveryId, updatedAt),
    d1.prepare("DELETE FROM recovery_lock WHERE id = ? AND recovery_id = ? AND acquired_at = ?")
      .bind(RECOVERY_LOCK_ID, recoveryId, updatedAt),
  ]);
  if (changes(lease) !== 1) throw new RecoveryLeaseLostError();
  if (changes(row) !== 1) throw new RecoveryPersistenceError();
}

export async function persistFailedRecoveryWithLease(
  d1: D1Database,
  recoveryId: string,
  error: string,
  updatedAt: string,
) {
  const [row] = await d1.batch([
    d1.prepare(`UPDATE recoveries SET
        stage = 'failed',
        status = 'failed',
        detail = 'The recovery could not be completed.',
        error = ?,
        updated_at = ?
      WHERE id = ? AND status = 'running'`)
      .bind(error, updatedAt, recoveryId),
    d1.prepare("DELETE FROM recovery_lock WHERE id = ? AND recovery_id = ?")
      .bind(RECOVERY_LOCK_ID, recoveryId),
  ]);
  return changes(row) === 1;
}
