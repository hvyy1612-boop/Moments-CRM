-- Change Requests (docs/25 Part 3): typed composite payload + drift snapshot + client-agreement facts.
ALTER TABLE "change_requests"
  ADD COLUMN "payload" JSONB,
  ADD COLUMN "payload_version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "assessed_booking_version" VARCHAR(64),
  ADD COLUMN "assessed_quote_version_id" VARCHAR(30),
  ADD COLUMN "client_agreed_via" VARCHAR(30),
  ADD COLUMN "client_agreed_at" TIMESTAMPTZ,
  ADD COLUMN "client_agreed_by_user_id" VARCHAR(30),
  ADD COLUMN "agreed_quote_version_id" VARCHAR(30),
  ADD COLUMN "applied_at" TIMESTAMPTZ;
