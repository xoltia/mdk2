CREATE TABLE `queue` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` text NOT NULL,
	`songUrl` text NOT NULL,
	`position` integer NOT NULL,
	`queuedAt` integer DEFAULT (unixepoch()) NOT NULL,
	`dequeuedAt` integer,
	FOREIGN KEY (`songUrl`) REFERENCES `songs`(`url`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `queue_position_unique` ON `queue` (`position`);--> statement-breakpoint
CREATE TABLE `songs` (
	`url` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`duration` integer NOT NULL,
	`thumbnail` text NOT NULL
);
