-- One-off prod cleanup: delete product user handle `arsalan-a-software-engin`
-- and Auth.js rows for that user's email.
--
-- Mirrors apps/api DELETE /v1/dashboard/account + packages/db delete-user-by-handle.ts
--
-- FK cascade from users.id:
--   gate_rules CASCADE
--   requests CASCADE → outbound_emails CASCADE
--   abuse_events.target_user_id SET NULL
--
-- Does NOT touch billing_accounts / pro_waitlist / suppressions (email-keyed).
--
-- Run against Railway Postgres (prod DATABASE_URL), e.g.:
--   railway connect Postgres   # or psql "$DATABASE_URL" -f this file
-- Prefer the TS CLI when available:
--   DATABASE_URL=… pnpm --filter @gatekeeper/db db:delete-user -- arsalan-a-software-engin --yes

BEGIN;

-- Preview (optional — comment out before apply if desired)
-- SELECT id, handle, email, name FROM users WHERE handle = 'arsalan-a-software-engin';

-- Capture email for Auth.js cleanup
DO $$
DECLARE
  v_id uuid;
  v_email text;
BEGIN
  SELECT id, email INTO v_id, v_email
  FROM users
  WHERE handle = 'arsalan-a-software-engin';

  IF v_id IS NULL THEN
    RAISE NOTICE 'No users row for handle arsalan-a-software-engin';
    RETURN;
  END IF;

  -- Product user: cascades gate_rules + requests (+ outbound_emails)
  DELETE FROM users WHERE id = v_id;

  -- Auth.js tables (names: user / account / session / verificationToken)
  DELETE FROM "session"
  WHERE "userId" IN (SELECT id FROM "user" WHERE email = v_email);

  DELETE FROM "account"
  WHERE "userId" IN (SELECT id FROM "user" WHERE email = v_email);

  DELETE FROM "user" WHERE email = v_email;

  DELETE FROM "verificationToken" WHERE identifier = v_email;

  RAISE NOTICE 'Deleted users.id=% email=%', v_id, v_email;
END $$;

COMMIT;
