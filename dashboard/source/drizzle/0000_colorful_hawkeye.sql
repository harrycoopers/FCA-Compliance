CREATE TABLE `deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`return_id` text NOT NULL,
	`version` text NOT NULL,
	`message` text NOT NULL,
	`date` text NOT NULL,
	`state` text NOT NULL,
	`read` integer DEFAULT 0 NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`error` text,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`subscription` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `records` (
	`owner` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL
);
