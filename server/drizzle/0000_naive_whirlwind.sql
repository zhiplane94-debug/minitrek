CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`day_id` text NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`address` text,
	`lat` real,
	`lng` real,
	`time` text,
	`cost` real,
	`book_status` text DEFAULT '待预订' NOT NULL,
	`note` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`ref_type` text,
	`ref_id` text,
	FOREIGN KEY (`day_id`) REFERENCES `trip_days`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `checklist_items` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`name` text NOT NULL,
	`done` integer DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `family_members` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`birth_year` integer,
	`note` text,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `mcp_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`label` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `trip_days` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`day_no` integer NOT NULL,
	`date` text NOT NULL,
	`note` text,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `trips` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`origin` text NOT NULL,
	`destination` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`status` text DEFAULT '规划中' NOT NULL,
	`share_token` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
