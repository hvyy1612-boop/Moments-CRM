-- Studio-Ninja-style staff quote presentation fields (docs/31). Additive, nullable; no data backfill.
ALTER TABLE "quote_versions" ADD COLUMN "introduction" TEXT;
ALTER TABLE "quote_versions" ADD COLUMN "po_number" VARCHAR(60);
ALTER TABLE "quote_versions" ADD COLUMN "notes" TEXT;
