-- Clubs that already exist stay private: nobody chose to list them. The
-- default then turns to public, for every club created from here on.
ALTER TABLE "clubs" ADD COLUMN "is_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "clubs" ALTER COLUMN "is_public" SET DEFAULT true;--> statement-breakpoint
CREATE INDEX "clubs_public_idx" ON "clubs" USING btree ("is_public");
