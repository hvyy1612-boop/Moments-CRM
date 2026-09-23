-- docs/31: Enquiry-stage quotes (additive, backward-compatible). A quote belongs to an Enquiry;
-- projectId becomes nullable (legacy/compat, set on accept); Project.sourceQuoteId back-refs the
-- accepted quote; seq = per-company display number. No destructive change; existing rows keep projectId.

ALTER TABLE "quotes" ADD COLUMN "enquiry_id" VARCHAR(30);
ALTER TABLE "quotes" ADD COLUMN "seq" INTEGER;
ALTER TABLE "quotes" ALTER COLUMN "project_id" DROP NOT NULL;
ALTER TABLE "projects" ADD COLUMN "source_quote_id" VARCHAR(30);

ALTER TABLE "quotes" ADD CONSTRAINT "quotes_enquiry_id_fkey"
  FOREIGN KEY ("enquiry_id") REFERENCES "enquiries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "projects" ADD CONSTRAINT "projects_source_quote_id_fkey"
  FOREIGN KEY ("source_quote_id") REFERENCES "quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "quotes_enquiry_id_idx" ON "quotes"("enquiry_id");
CREATE UNIQUE INDEX "projects_source_quote_id_key" ON "projects"("source_quote_id");
CREATE UNIQUE INDEX "quotes_seq_key" ON "quotes"("seq");
-- Invariant: at most one ACCEPTED quote per enquiry (docs/31).
CREATE UNIQUE INDEX "quotes_one_accepted_per_enquiry" ON "quotes"("enquiry_id") WHERE "status" = 'ACCEPTED';

-- Backfill: link existing quotes to the enquiry their project came from (proven via converted_project_id).
UPDATE "quotes" q SET "enquiry_id" = e."id"
FROM "enquiries" e
WHERE e."converted_project_id" = q."project_id" AND q."enquiry_id" IS NULL;

-- Backfill: assign a stable seq by creation order.
WITH ordered AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "created_at", "id") AS rn FROM "quotes"
)
UPDATE "quotes" q SET "seq" = o.rn FROM ordered o WHERE o."id" = q."id" AND q."seq" IS NULL;
