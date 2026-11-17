-- Ownership proof for alternate intro contact emails (user-scoped).
-- Global verified_senders is NOT sufficient: it only proves someone verified that
-- address as a sender, not that the Gatekeeper user owns it.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "intro_contact_verified_at" timestamptz;
