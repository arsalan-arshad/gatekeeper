DROP VIEW "public"."ledger_stats";--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "helpful" boolean;--> statement-breakpoint
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
        ELSE (count(*) FILTER (WHERE decision = 'accept'))::float8 / count(*)::float8
      END AS accept_rate
    FROM requests
    GROUP BY target_user_id, date_trunc('month', created_at)
  );