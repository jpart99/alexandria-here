import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const recoveries = sqliteTable(
  "recoveries",
  {
    id: text("id").primaryKey(),
    submittedUrl: text("submitted_url").notNull(),
    normalizedUrl: text("normalized_url").notNull(),
    status: text("status").notNull(),
    stage: text("stage").notNull(),
    detail: text("detail"),
    resultJson: text("result_json"),
    error: text("error"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("recoveries_created_at_idx").on(table.createdAt),
    index("recoveries_normalized_url_idx").on(table.normalizedUrl),
  ],
);

export const recoveryLock = sqliteTable(
  "recovery_lock",
  {
    id: integer("id").primaryKey(),
    recoveryId: text("recovery_id").notNull(),
    acquiredAt: text("acquired_at").notNull(),
  },
  (table) => [check("recovery_lock_singleton_check", sql`${table.id} = 1`)],
);

export const recoveryRateLimits = sqliteTable(
  "recovery_rate_limits",
  {
    clientKeyHash: text("client_key_hash").primaryKey(),
    lastStartedAt: text("last_started_at").notNull(),
  },
  (table) => [index("recovery_rate_limits_started_at_idx").on(table.lastStartedAt)],
);
