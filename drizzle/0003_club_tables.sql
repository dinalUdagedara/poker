CREATE TABLE "club_tables" (
	"id" text PRIMARY KEY NOT NULL,
	"club_id" text NOT NULL,
	"name" text NOT NULL,
	"small_blind" bigint NOT NULL,
	"big_blind" bigint NOT NULL,
	"min_buy_in" bigint NOT NULL,
	"max_buy_in" bigint NOT NULL,
	"seat_count" integer NOT NULL,
	"action_seconds" integer NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"closes_at" timestamp NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"closed_at" timestamp,
	CONSTRAINT "club_tables_status_check" CHECK ("club_tables"."status" in ('open', 'closed'))
);
--> statement-breakpoint
CREATE TABLE "seat_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"table_id" text NOT NULL,
	"club_id" text NOT NULL,
	"user_id" text NOT NULL,
	"bought_in" bigint NOT NULL,
	"last_stack" bigint NOT NULL,
	"cashed_out" bigint,
	"opened_at" timestamp DEFAULT now() NOT NULL,
	"closed_at" timestamp,
	CONSTRAINT "seat_sessions_bought_in_check" CHECK ("seat_sessions"."bought_in" > 0),
	CONSTRAINT "seat_sessions_cashed_out_check" CHECK ("seat_sessions"."cashed_out" is null or "seat_sessions"."cashed_out" >= 0)
);
--> statement-breakpoint
ALTER TABLE "club_tables" ADD CONSTRAINT "club_tables_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_tables" ADD CONSTRAINT "club_tables_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_sessions" ADD CONSTRAINT "seat_sessions_table_id_club_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."club_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_sessions" ADD CONSTRAINT "seat_sessions_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_sessions" ADD CONSTRAINT "seat_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "club_tables_club_status_idx" ON "club_tables" USING btree ("club_id","status");--> statement-breakpoint
CREATE INDEX "seat_sessions_table_idx" ON "seat_sessions" USING btree ("table_id");--> statement-breakpoint
CREATE INDEX "seat_sessions_club_user_idx" ON "seat_sessions" USING btree ("club_id","user_id");