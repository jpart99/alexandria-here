CREATE TABLE IF NOT EXISTS `recovery_lock` (
	`id` integer PRIMARY KEY NOT NULL,
	`recovery_id` text NOT NULL,
	`acquired_at` text NOT NULL,
	CONSTRAINT "recovery_lock_singleton_check" CHECK("recovery_lock"."id" = 1)
);
