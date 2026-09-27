-- Step-up PIN for the read-only Activity page (docs/activity): a 4-digit PIN, stored only as an
-- Argon2id hash, that an admin sets to re-open Activity, with its own server-side lockout counter.
-- The account password remains a fallback. All columns are additive + nullable, so existing rows are
-- untouched and no admin has a PIN until they create one on the Activity screen.
ALTER TABLE "users" ADD COLUMN "activity_pin_hash" VARCHAR(255);
ALTER TABLE "users" ADD COLUMN "activity_pin_algo" VARCHAR(30);
ALTER TABLE "users" ADD COLUMN "activity_pin_failed_attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "activity_pin_locked_until" TIMESTAMPTZ;
