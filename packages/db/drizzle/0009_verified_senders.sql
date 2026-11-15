CREATE TABLE IF NOT EXISTS "verified_senders" (
  "email" text PRIMARY KEY NOT NULL,
  "verified_at" timestamp with time zone DEFAULT now() NOT NULL
);
