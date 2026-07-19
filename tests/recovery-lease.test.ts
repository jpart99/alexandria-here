import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { allocateRecoveryId, MAX_RECOVERY_ID_ATTEMPTS } from "../lib/recovery-id";
import {
  admitRunningRecovery,
  cleanupRejectedAdmission,
  persistCompletedRecoveryWithLease,
  persistRecoveryStageWithLease,
  RecoveryBusyError,
  RecoveryIdCollisionError,
  RecoveryLeaseLostError,
  recoveryIdExists,
} from "../lib/recovery-lease";

type BoundStatement = D1PreparedStatement & { run(): Promise<D1Result<unknown>> };

function sqliteD1(database: DatabaseSync): D1Database {
  let batchQueue: Promise<unknown> = Promise.resolve();
  function prepared(sql: string, bindings: unknown[] = []): BoundStatement {
    return {
      bind(...values: unknown[]) {
        return prepared(sql, values);
      },
      async run() {
        const result = database.prepare(sql).run(...bindings as never[]);
        return { success: true, results: [], meta: { changes: Number(result.changes) } } as unknown as D1Result<unknown>;
      },
      async first<T>(column?: string) {
        const row = database.prepare(sql).get(...bindings as never[]) as Record<string, unknown> | undefined;
        if (!row) return null;
        return (column ? row[column] : row) as T;
      },
      async raw<T>() {
        const rows = database.prepare(sql).all(...bindings as never[]) as T[];
        return rows;
      },
    } as BoundStatement;
  }

  return {
    prepare(sql: string) {
      return prepared(sql);
    },
    batch(statements: D1PreparedStatement[]) {
      const execute = async () => {
        database.exec("BEGIN IMMEDIATE");
        try {
          const results: D1Result<unknown>[] = [];
          for (const statement of statements) results.push(await (statement as BoundStatement).run());
          database.exec("COMMIT");
          return results;
        } catch (error) {
          database.exec("ROLLBACK");
          throw error;
        }
      };
      const result = batchQueue.then(execute, execute);
      batchQueue = result.then(() => undefined, () => undefined);
      return result;
    },
  } as unknown as D1Database;
}

function recoveryDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec(`CREATE TABLE recoveries (
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
  );
  CREATE TABLE recovery_lock (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    recovery_id TEXT NOT NULL,
    acquired_at TEXT NOT NULL
  );`);
  return { database, d1: sqliteD1(database) };
}

function seedRunning(database: DatabaseSync, id: string, timestamp: string) {
  database.prepare(`INSERT INTO recoveries (
    id, submitted_url, normalized_url, status, stage, detail, created_at, updated_at
  ) VALUES (?, 'http://lost.test/', 'http://lost.test/', 'running', 'finding_captures', 'working', ?, ?)`)
    .run(id, timestamp, timestamp);
}

test("stale takeover atomically terminalizes the former holder and fences its later writes", async () => {
  const { database, d1 } = recoveryDatabase();
  const oldTime = "2026-07-18T12:00:00.000Z";
  const takeoverTime = "2026-07-18T12:16:00.000Z";
  seedRunning(database, "old-recovery", oldTime);
  database.prepare("INSERT INTO recovery_lock (id, recovery_id, acquired_at) VALUES (1, ?, ?)")
    .run("old-recovery", oldTime);

  await admitRunningRecovery(d1, {
    id: "new-recovery",
    submittedUrl: "new.test",
    normalizedUrl: "http://new.test/",
    createdAt: takeoverTime,
  });
  const former = database.prepare("SELECT status, stage, error FROM recoveries WHERE id = ?")
    .get("old-recovery") as { status: string; stage: string; error: string };
  const lock = database.prepare("SELECT recovery_id, acquired_at FROM recovery_lock WHERE id = 1")
    .get() as { recovery_id: string; acquired_at: string };
  assert.deepEqual({ ...former }, {
    status: "failed",
    stage: "failed",
    error: "The recovery lease expired before verification finished.",
  });
  assert.deepEqual({ ...lock }, { recovery_id: "new-recovery", acquired_at: takeoverTime });

  await assert.rejects(
    persistRecoveryStageWithLease(d1, "old-recovery", "reading_surviving_pages", "late write", takeoverTime),
    RecoveryLeaseLostError,
  );
  assert.equal(
    (database.prepare("SELECT recovery_id FROM recovery_lock WHERE id = 1").get() as { recovery_id: string }).recovery_id,
    "new-recovery",
  );
});

test("an active lease renews at persisted stages, blocks concurrency, and releases only after completion", async () => {
  const { database, d1 } = recoveryDatabase();
  const startedAt = "2026-07-18T12:00:00.000Z";
  await admitRunningRecovery(d1, {
    id: "active-recovery",
    submittedUrl: "lost.test",
    normalizedUrl: "http://lost.test/",
    createdAt: startedAt,
  });

  const renewedAt = "2026-07-18T12:10:00.000Z";
  await persistRecoveryStageWithLease(
    d1,
    "active-recovery",
    "reading_surviving_pages",
    "Reading bounded witnesses.",
    renewedAt,
  );
  assert.equal(
    (database.prepare("SELECT acquired_at FROM recovery_lock WHERE id = 1").get() as { acquired_at: string }).acquired_at,
    renewedAt,
  );
  await assert.rejects(
    admitRunningRecovery(d1, {
      id: "concurrent-recovery",
      submittedUrl: "concurrent.test",
      normalizedUrl: "http://concurrent.test/",
      createdAt: "2026-07-18T12:20:00.000Z",
    }),
    RecoveryBusyError,
  );

  await persistCompletedRecoveryWithLease(
    d1,
    "active-recovery",
    '{"id":"active-recovery"}',
    "2026-07-18T12:20:01.000Z",
  );
  const completed = database.prepare("SELECT status, stage, result_json FROM recoveries WHERE id = ?")
    .get("active-recovery") as { status: string; stage: string; result_json: string };
  assert.deepEqual({ ...completed }, {
    status: "complete",
    stage: "complete",
    result_json: '{"id":"active-recovery"}',
  });
  assert.equal(database.prepare("SELECT recovery_id FROM recovery_lock").get(), undefined);
});

test("concurrent production admission cannot expose a fresh lease without its running row", async () => {
  const { database, d1 } = recoveryDatabase();
  const admittedAt = "2026-07-18T12:00:00.000Z";
  const [first, second] = await Promise.allSettled([
    admitRunningRecovery(d1, {
      id: "recovery-a",
      submittedUrl: "a.test",
      normalizedUrl: "http://a.test/",
      createdAt: admittedAt,
    }),
    admitRunningRecovery(d1, {
      id: "recovery-b",
      submittedUrl: "b.test",
      normalizedUrl: "http://b.test/",
      createdAt: admittedAt,
    }),
  ]);
  assert.equal(first.status, "fulfilled");
  assert.equal(second.status, "rejected");
  if (second.status === "rejected") assert.ok(second.reason instanceof RecoveryBusyError);
  assert.deepEqual(
    database.prepare("SELECT id FROM recoveries WHERE status = 'running' ORDER BY id").all().map((row) => ({ ...row })),
    [{ id: "recovery-a" }],
  );
  assert.equal(
    (database.prepare("SELECT recovery_id FROM recovery_lock WHERE id = 1").get() as { recovery_id: string }).recovery_id,
    "recovery-a",
  );
});

test("concurrent identical recovery IDs cannot ABA-release the admitted lease", async () => {
  const { database, d1 } = recoveryDatabase();
  const recovery = {
    id: "same-recovery",
    submittedUrl: "same.test",
    normalizedUrl: "http://same.test/",
    createdAt: "2026-07-18T12:00:00.000Z",
  };
  const [first, second] = await Promise.allSettled([
    admitRunningRecovery(d1, recovery),
    admitRunningRecovery(d1, recovery),
  ]);
  assert.equal(first.status, "fulfilled");
  assert.equal(second.status, "rejected");
  if (second.status === "rejected") assert.ok(second.reason instanceof RecoveryBusyError);
  assert.equal(
    (database.prepare("SELECT COUNT(*) AS count FROM recoveries WHERE status = 'running'").get() as { count: number }).count,
    1,
  );
  assert.equal(
    (database.prepare("SELECT recovery_id FROM recovery_lock WHERE id = 1").get() as { recovery_id: string }).recovery_id,
    recovery.id,
  );
});

test("cooldown rejection cleanup cannot ABA-delete an identical-UUID successor lease", async () => {
  const { database, d1 } = recoveryDatabase();
  const firstTime = "2026-07-18T12:00:00.000Z";
  const successorTime = "2026-07-18T12:00:01.000Z";
  await admitRunningRecovery(d1, {
    id: "same-recovery",
    submittedUrl: "first.test",
    normalizedUrl: "http://first.test/",
    createdAt: firstTime,
  });

  const [cleanup, successor] = await Promise.allSettled([
    cleanupRejectedAdmission(d1, "same-recovery", firstTime),
    admitRunningRecovery(d1, {
      id: "same-recovery",
      submittedUrl: "successor.test",
      normalizedUrl: "http://successor.test/",
      createdAt: successorTime,
    }),
  ]);
  assert.equal(cleanup.status, "fulfilled");
  assert.equal(successor.status, "fulfilled");
  assert.deepEqual(
    {
      ...(database.prepare("SELECT submitted_url, created_at FROM recoveries WHERE id = ?")
        .get("same-recovery") as { submitted_url: string; created_at: string }),
    },
    { submitted_url: "successor.test", created_at: successorTime },
  );
  assert.deepEqual(
    {
      ...(database.prepare("SELECT recovery_id, acquired_at FROM recovery_lock WHERE id = 1")
        .get() as { recovery_id: string; acquired_at: string }),
    },
    { recovery_id: "same-recovery", acquired_at: successorTime },
  );

  await cleanupRejectedAdmission(d1, "same-recovery", firstTime);
  assert.equal(
    (database.prepare("SELECT acquired_at FROM recovery_lock WHERE id = 1").get() as { acquired_at: string }).acquired_at,
    successorTime,
  );
});

test("corrupt and implausibly future lock timestamps cannot wedge the singleton", async () => {
  for (const corruptTimestamp of ["not-a-date", "9999-01-01T00:00:00.000Z"]) {
    const { database, d1 } = recoveryDatabase();
    seedRunning(database, "corrupt-holder", "2026-07-18T11:00:00.000Z");
    database.prepare("INSERT INTO recovery_lock (id, recovery_id, acquired_at) VALUES (1, ?, ?)")
      .run("corrupt-holder", corruptTimestamp);
    await admitRunningRecovery(d1, {
      id: "recovered-holder",
      submittedUrl: "recovered.test",
      normalizedUrl: "http://recovered.test/",
      createdAt: "2026-07-18T12:00:00.000Z",
    });
    assert.equal(
      (database.prepare("SELECT recovery_id FROM recovery_lock WHERE id = 1").get() as { recovery_id: string }).recovery_id,
      "recovered-holder",
    );
    assert.equal(
      (database.prepare("SELECT status FROM recoveries WHERE id = ?").get("corrupt-holder") as { status: string }).status,
      "failed",
    );
  }
});

test("a fresh orphan or terminal-holder lock is immediately recoverable", async () => {
  for (const holderState of ["missing", "complete"] as const) {
    const { database, d1 } = recoveryDatabase();
    if (holderState === "complete") {
      seedRunning(database, "orphan-holder", "2026-07-18T12:00:00.000Z");
      database.prepare("UPDATE recoveries SET status = 'complete', stage = 'complete' WHERE id = ?")
        .run("orphan-holder");
    }
    database.prepare("INSERT INTO recovery_lock (id, recovery_id, acquired_at) VALUES (1, ?, ?)")
      .run("orphan-holder", "2026-07-18T12:00:30.000Z");

    await admitRunningRecovery(d1, {
      id: "new-holder",
      submittedUrl: "new.test",
      normalizedUrl: "http://new.test/",
      createdAt: "2026-07-18T12:01:00.000Z",
    });
    assert.equal(
      (database.prepare("SELECT recovery_id FROM recovery_lock WHERE id = 1").get() as { recovery_id: string }).recovery_id,
      "new-holder",
    );
  }
});

test("a missing durable row cannot receive progress and its orphan lease is removed", async () => {
  const { database, d1 } = recoveryDatabase();
  await admitRunningRecovery(d1, {
    id: "missing-row",
    submittedUrl: "missing.test",
    normalizedUrl: "http://missing.test/",
    createdAt: "2026-07-18T12:00:00.000Z",
  });
  database.prepare("DELETE FROM recoveries WHERE id = ?").run("missing-row");
  await assert.rejects(
    persistRecoveryStageWithLease(
      d1,
      "missing-row",
      "reading_surviving_pages",
      "This must not be emitted.",
      "2026-07-18T12:01:00.000Z",
    ),
    RecoveryLeaseLostError,
  );
  assert.equal(database.prepare("SELECT recovery_id FROM recovery_lock").get(), undefined);
});

test("recovery ID insertion fails before admission state can overwrite an existing row", async () => {
  const { database, d1 } = recoveryDatabase();
  seedRunning(database, "existing-id", "2026-07-18T12:00:00.000Z");
  database.prepare("UPDATE recoveries SET status = 'complete', stage = 'complete' WHERE id = ?")
    .run("existing-id");
  assert.equal(await recoveryIdExists(d1, "existing-id"), true);
  assert.equal(await recoveryIdExists(d1, "fresh-id"), false);
  await assert.rejects(
    admitRunningRecovery(d1, {
      id: "existing-id",
      submittedUrl: "other.test",
      normalizedUrl: "http://other.test/",
      createdAt: "2026-07-18T12:10:00.000Z",
    }),
    RecoveryIdCollisionError,
  );
  const existing = database.prepare("SELECT submitted_url, status FROM recoveries WHERE id = ?")
    .get("existing-id") as { submitted_url: string; status: string };
  assert.deepEqual({ ...existing }, { submitted_url: "http://lost.test/", status: "complete" });
});

test("recovery ID allocation retries only typed collisions and is strictly bounded", async () => {
  const ids = ["collision", "fresh"];
  const attempts: string[] = [];
  const allocated = await allocateRecoveryId(
    () => ids.shift() || "unexpected",
    async (id) => {
      attempts.push(id);
      if (id === "collision") throw new RecoveryIdCollisionError();
      return "created-at";
    },
  );
  assert.deepEqual(allocated, { recoveryId: "fresh", value: "created-at" });
  assert.deepEqual(attempts, ["collision", "fresh"]);

  let count = 0;
  await assert.rejects(
    allocateRecoveryId(
      () => `collision-${count}`,
      async () => {
        count += 1;
        throw new RecoveryIdCollisionError();
      },
    ),
    RecoveryIdCollisionError,
  );
  assert.equal(count, MAX_RECOVERY_ID_ATTEMPTS);
});
