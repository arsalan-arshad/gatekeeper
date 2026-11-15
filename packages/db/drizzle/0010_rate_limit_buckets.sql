CREATE TABLE IF NOT EXISTS "rate_limit_buckets" (
  "bucket_key" text PRIMARY KEY NOT NULL,
  "window_start" timestamp with time zone NOT NULL,
  "count" integer NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
