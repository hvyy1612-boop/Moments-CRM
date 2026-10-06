-- Clean-up (2026-10-06): columns that were written but never read, the outbox (events were only ever
-- marked processed), and the btree_gist extension (it only served the removed crew-booking rule).
-- Two unique indexes that production already had are now declared in the schema (quote numbers retry on
-- a clash; one lead per job), created only where missing.
BEGIN;

ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_source_quote_id_fkey";
DROP INDEX IF EXISTS "projects_source_quote_id_key";
ALTER TABLE "projects" DROP COLUMN "source_quote_id";

ALTER TABLE "change_requests" DROP COLUMN "payload_version",
DROP COLUMN "schedule_impact";
ALTER TABLE "communications" DROP COLUMN "channel";
ALTER TABLE "companies" DROP COLUMN "timezone";
ALTER TABLE "enquiries" DROP COLUMN "converted_at",
DROP COLUMN "lost_reason";
ALTER TABLE "payment_transactions" DROP COLUMN "processed_at";
ALTER TABLE "quote_versions" DROP COLUMN "viewed_by_client_at";
ALTER TABLE "refunds" DROP COLUMN "processed_at";

DROP TABLE "outbox_events";
DROP TYPE "OutboxStatus";

CREATE UNIQUE INDEX IF NOT EXISTS "enquiries_converted_project_id_key" ON "enquiries"("converted_project_id");
CREATE UNIQUE INDEX IF NOT EXISTS "quotes_seq_key" ON "quotes"("seq");

DROP EXTENSION IF EXISTS "btree_gist";

COMMIT;
