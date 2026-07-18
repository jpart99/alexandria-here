CREATE TABLE `recovery_rate_limits` (
	`client_key_hash` text PRIMARY KEY NOT NULL,
	`last_started_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `recovery_rate_limits_started_at_idx` ON `recovery_rate_limits` (`last_started_at`);