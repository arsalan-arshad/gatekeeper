ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "directory_opt_in" boolean DEFAULT false NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "directory_opt_in_at" timestamp with time zone;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "directory_role" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "directory_tags" text[] DEFAULT '{}' NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "directory_prompt_dismissed_at" timestamp with time zone;
CREATE INDEX IF NOT EXISTS users_directory_opt_in_idx ON users (updated_at DESC) WHERE directory_opt_in = true;
CREATE INDEX IF NOT EXISTS users_directory_tags_gin ON users USING gin (directory_tags);
