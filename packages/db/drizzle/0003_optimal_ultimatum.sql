CREATE TYPE "public"."plan" AS ENUM('free', 'pro');--> statement-breakpoint
CREATE TABLE "billing_accounts" (
	"email" text PRIMARY KEY NOT NULL,
	"credits_cents" integer DEFAULT 0 NOT NULL,
	"lemon_customer_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lemon_event_id" text NOT NULL,
	"event_name" text NOT NULL,
	"payload" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_events_lemon_event_id_unique" UNIQUE("lemon_event_id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "plan" "plan" DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "lemon_customer_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "lemon_subscription_id" text;