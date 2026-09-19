CREATE TABLE "chip_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"club_id" text NOT NULL,
	"user_id" text NOT NULL,
	"amount" bigint NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"decided_at" timestamp,
	CONSTRAINT "chip_requests_amount_check" CHECK ("chip_requests"."amount" > 0),
	CONSTRAINT "chip_requests_status_check" CHECK ("chip_requests"."status" in ('pending', 'approved', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"club_id" text NOT NULL,
	"user_id" text NOT NULL,
	"amount" bigint NOT NULL,
	"balance_after" bigint NOT NULL,
	"kind" text NOT NULL,
	"actor_id" text,
	"request_id" text,
	"table_id" text,
	"session_id" text,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "ledger_amount_check" CHECK ("ledger"."amount" <> 0),
	CONSTRAINT "ledger_balance_after_check" CHECK ("ledger"."balance_after" >= 0),
	CONSTRAINT "ledger_kind_check" CHECK ("ledger"."kind" in ('send', 'claim', 'removal', 'buy_in', 'cash_out', 'refund'))
);
--> statement-breakpoint
ALTER TABLE "club_members" ADD COLUMN "balance" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "chip_requests" ADD CONSTRAINT "chip_requests_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chip_requests" ADD CONSTRAINT "chip_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chip_requests" ADD CONSTRAINT "chip_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger" ADD CONSTRAINT "ledger_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger" ADD CONSTRAINT "ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger" ADD CONSTRAINT "ledger_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chip_requests_club_status_idx" ON "chip_requests" USING btree ("club_id","status");--> statement-breakpoint
CREATE INDEX "ledger_club_created_idx" ON "ledger" USING btree ("club_id","created_at");--> statement-breakpoint
CREATE INDEX "ledger_club_user_idx" ON "ledger" USING btree ("club_id","user_id");--> statement-breakpoint
ALTER TABLE "club_members" ADD CONSTRAINT "club_members_balance_check" CHECK ("club_members"."balance" >= 0);