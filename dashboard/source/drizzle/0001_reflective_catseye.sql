CREATE TABLE `document_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`filename` text NOT NULL,
	`blob_key` text NOT NULL,
	`version` text NOT NULL,
	`scan` text NOT NULL,
	`mappings` text DEFAULT '{}' NOT NULL,
	`saved` integer DEFAULT 1 NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `generated_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`company_id` text NOT NULL,
	`company_name` text NOT NULL,
	`template_id` text NOT NULL,
	`template_name` text NOT NULL,
	`template_version` text NOT NULL,
	`filename` text NOT NULL,
	`blob_key` text NOT NULL,
	`audit` text NOT NULL,
	`created` text NOT NULL
);
