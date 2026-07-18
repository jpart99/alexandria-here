CREATE TABLE IF NOT EXISTS `recoveries` (
	`id` text PRIMARY KEY NOT NULL,
	`submitted_url` text NOT NULL,
	`normalized_url` text NOT NULL,
	`status` text NOT NULL,
	`stage` text NOT NULL,
	`detail` text,
	`result_json` text,
	`error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `recoveries_created_at_idx` ON `recoveries` (`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `recoveries_normalized_url_idx` ON `recoveries` (`normalized_url`);
