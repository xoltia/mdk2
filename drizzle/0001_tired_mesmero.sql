ALTER TABLE `queue` ADD `slug` text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `slug_idx` ON `queue` (`slug`) WHERE "queue"."dequeuedAt" is null;