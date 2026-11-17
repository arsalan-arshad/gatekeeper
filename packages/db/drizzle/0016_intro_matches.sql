DO $$ BEGIN
  CREATE TYPE match_status AS ENUM ('pending','accepted','declined','expired','gated');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "intro_matches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "requester_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "recipient_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "note" text NOT NULL,
  "similarity" double precision NOT NULL,
  "ai_score" integer,
  "ai_decision" "decision",
  "ai_reason_public" text,
  "status" match_status NOT NULL DEFAULT 'pending',
  "recipient_decision" "decision",
  "decided_at" timestamp with time zone,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT intro_matches_not_self CHECK (requester_id <> recipient_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS intro_matches_pair_live
  ON intro_matches (LEAST(requester_id, recipient_id), GREATEST(requester_id, recipient_id))
  WHERE status IN ('pending','accepted');

CREATE INDEX IF NOT EXISTS intro_matches_recipient_status_created_idx
  ON intro_matches (recipient_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS "match_dismissals" (
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "dismissed_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("user_id", "dismissed_user_id")
);

CREATE TABLE IF NOT EXISTS "match_outbound_emails" (
  "match_id" uuid NOT NULL REFERENCES "intro_matches"("id") ON DELETE CASCADE,
  "email_type" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("match_id", "email_type")
);
