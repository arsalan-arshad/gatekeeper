CREATE TYPE "public"."notification_email_mode" AS ENUM('instant', 'daily_digest', 'off');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "notification_email_mode" "notification_email_mode" DEFAULT 'instant' NOT NULL;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "ai_reason_public" text;
