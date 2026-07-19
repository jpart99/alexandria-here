import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { recoveryNotFoundResponse } from "../lib/recovery-http";
import { isRecoveryId } from "../lib/recovery-id";

const malformedId = "not-a-recovery-id";
const root = path.resolve(import.meta.dirname, "..");

test("recovery identifiers accept only generated UUIDv4 values", () => {
  assert.equal(isRecoveryId("18026989-33be-4011-86ee-19e1754cb22c"), true);
  assert.equal(isRecoveryId("18026989-33be-5011-86ee-19e1754cb22c"), false);
  assert.equal(isRecoveryId(malformedId), false);
});

test("recovery not-found JSON is private, non-cacheable, and nosniff", async () => {
  const response = recoveryNotFoundResponse();
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(await response.json(), { error: "Recovery not found." });
});

test("every recovery read surface validates the identifier before querying D1", async () => {
  const files = [
    "app/api/recover/[id]/route.ts",
    "app/api/recover/[id]/receipt/route.ts",
    "app/r/[id]/[[...path]]/page.tsx",
  ];
  for (const relativePath of files) {
    const source = await readFile(path.join(root, relativePath), "utf8");
    const guards = [...source.matchAll(/isRecoveryId\(id\)/gu)].map((match) => match.index);
    const queries = [...source.matchAll(/getRecoveryRecord\(id\)/gu)].map((match) => match.index);
    assert.equal(guards.length, queries.length, `${relativePath} must guard every durable lookup`);
    assert.ok(queries.length > 0, `${relativePath} must retain its durable lookup`);
    queries.forEach((query, index) => {
      assert.ok(guards[index] < query, `${relativePath} lookup ${index + 1} must reject malformed IDs before D1`);
    });
  }
});
