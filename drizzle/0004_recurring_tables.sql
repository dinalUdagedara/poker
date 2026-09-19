ALTER TABLE "club_tables" ADD COLUMN "auto_start" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "club_tables" ADD COLUMN "hours" integer DEFAULT 12 NOT NULL;--> statement-breakpoint
ALTER TABLE "club_tables" ADD COLUMN "recurring" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "club_tables" ADD COLUMN "series_id" text;