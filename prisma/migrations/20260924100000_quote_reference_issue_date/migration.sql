-- docs/31: an editable, required Quote ID (reference) + a required Issue Date on the quote editor.
-- Additive, nullable; existing quotes fall back to Q-seq / their sent date at display time.
ALTER TABLE "quotes" ADD COLUMN "reference" VARCHAR(60);
ALTER TABLE "quote_versions" ADD COLUMN "issue_date" TIMESTAMPTZ;
