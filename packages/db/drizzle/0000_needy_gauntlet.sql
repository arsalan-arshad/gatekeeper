CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."decision" AS ENUM('accept', 'reject', 'spam');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('pending', 'delivered', 'accepted', 'declined');--> statement-breakpoint
CREATE TYPE "public"."sender_type" AS ENUM('human', 'agent');--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_email" text NOT NULL,
	"hashed_key" text NOT NULL,
	"rate_limit" integer DEFAULT 60 NOT NULL,
	CONSTRAINT "api_keys_hashed_key_unique" UNIQUE("hashed_key")
);
--> statement-breakpoint
CREATE TABLE "gate_rules" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"rule_text" text NOT NULL,
	"min_relevance" integer DEFAULT 70 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sender_type" "sender_type" NOT NULL,
	"sender_name" text NOT NULL,
	"sender_contact" text NOT NULL,
	"api_key_id" uuid,
	"target_user_id" uuid NOT NULL,
	"message" text NOT NULL,
	"ai_score" integer,
	"ai_reason" text,
	"decision" "decision",
	"status" "request_status" DEFAULT 'pending' NOT NULL,
	"stake_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"handle" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"bio" text,
	"wants_text" text,
	"offers_text" text,
	"never_text" text,
	"profile_embedding" vector(768),
	CONSTRAINT "users_handle_unique" UNIQUE("handle"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "gate_rules" ADD CONSTRAINT "gate_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE VIEW "public"."ledger_stats" AS (
    SELECT
      target_user_id,
      date_trunc('month', created_at) AS month,
      count(*)::int AS request_count,
      count(*) FILTER (WHERE decision = 'accept')::int AS accept_count,
      count(*) FILTER (WHERE decision = 'reject')::int AS reject_count,
      count(*) FILTER (WHERE decision = 'spam')::int AS spam_count,
      CASE
        WHEN count(*) = 0 THEN 0::float8
        ELSE (count(*) FILTER (WHERE decision = 'accept'))::float8 / count(*)::float8
      END AS accept_rate
    FROM requests
    GROUP BY target_user_id, date_trunc('month', created_at)
  );