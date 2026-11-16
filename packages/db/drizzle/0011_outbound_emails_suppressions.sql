CREATE TABLE IF NOT EXISTS "outbound_emails" (
  "request_id" uuid NOT NULL,
  "email_type" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "outbound_emails_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "outbound_emails_request_id_email_type_pk" PRIMARY KEY("request_id","email_type")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_suppressions" (
  "email" text PRIMARY KEY NOT NULL,
  "reason" text NOT NULL,
  "source" text DEFAULT 'resend' NOT NULL,
  "payload" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
