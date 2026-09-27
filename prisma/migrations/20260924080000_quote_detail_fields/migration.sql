-- docs/31 Quote detail: persist the deposit % (for the payment schedule) and an immutable snapshot of a
-- package's inclusions on the quote line (so historical quotes stay accurate + show what's included).
-- Additive, nullable; no data change.
ALTER TABLE "quote_versions" ADD COLUMN "deposit_percent" INTEGER;
ALTER TABLE "quote_lines" ADD COLUMN "details" TEXT;
