ALTER TABLE "requests" ADD COLUMN "decided_at" timestamp with time zone;--> statement-breakpoint
-- Backfill decided_at for rows that already have an owner decision.
UPDATE "requests" SET "decided_at" = "created_at" WHERE "owner_decision" IS NOT NULL AND "decided_at" IS NULL;--> statement-breakpoint
-- Repair AI verdict when it was overwritten and no longer matches score bands
-- (spam 0–25, reject 26–59, accept 60–100). Only touch rows that look corrupted.
UPDATE "requests"
SET "decision" = CASE
  WHEN "ai_score" IS NULL THEN "decision"
  WHEN "ai_score" <= 25 THEN 'spam'::"decision"
  WHEN "ai_score" <= 59 THEN 'reject'::"decision"
  ELSE 'accept'::"decision"
END
WHERE "ai_score" IS NOT NULL
  AND (
    ("ai_score" <= 25 AND "decision" IS DISTINCT FROM 'spam'::"decision")
    OR ("ai_score" BETWEEN 26 AND 59 AND "decision" IS DISTINCT FROM 'reject'::"decision")
    OR ("ai_score" >= 60 AND "decision" IS DISTINCT FROM 'accept'::"decision")
  );--> statement-breakpoint
DROP VIEW "public"."ledger_stats";--> statement-breakpoint
CREATE VIEW "public"."ledger_stats" AS (
  SELECT
    target_user_id,
    date_trunc('month', created_at) AS month,
    count(*)::int AS request_count,
    count(*) FILTER (WHERE decision = 'accept')::int AS delivered_count,
    count(*) FILTER (WHERE status = 'accepted')::int AS accepted_count,
    count(*) FILTER (WHERE decision = 'spam')::int AS spam_count,
    count(*) FILTER (WHERE helpful IS TRUE)::int AS helpful_count,
    CASE
      WHEN count(*) = 0 THEN 0::float8
      ELSE (count(*) FILTER (WHERE status = 'accepted'))::float8 / count(*)::float8
    END AS accept_rate
  FROM requests
  GROUP BY target_user_id, date_trunc('month', created_at)
);
