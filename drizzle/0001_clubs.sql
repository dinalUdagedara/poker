CREATE TABLE "club_members" (
	"club_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'player' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"alias" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"referred_by" text,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"joined_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "club_members_club_id_user_id_pk" PRIMARY KEY("club_id","user_id"),
	CONSTRAINT "club_members_role_check" CHECK ("club_members"."role" in ('owner', 'player')),
	CONSTRAINT "club_members_status_check" CHECK ("club_members"."status" in ('pending', 'active', 'removed'))
);
--> statement-breakpoint
CREATE TABLE "clubs" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"lacquer" integer DEFAULT 0 NOT NULL,
	"notice" text DEFAULT '' NOT NULL,
	"owner_id" text NOT NULL,
	"auto_approve" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "clubs_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "club_members" ADD CONSTRAINT "club_members_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_members" ADD CONSTRAINT "club_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_members" ADD CONSTRAINT "club_members_referred_by_users_id_fk" FOREIGN KEY ("referred_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clubs" ADD CONSTRAINT "clubs_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "club_members_user_id_idx" ON "club_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "clubs_owner_id_idx" ON "clubs" USING btree ("owner_id");