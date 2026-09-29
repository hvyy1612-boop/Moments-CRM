-- Widen Enquiry.heardAbout from VARCHAR(120) to TEXT so the "How did you hear about us?" answer can
-- hold up to the website form's 5000-character limit, consistent with the other free-text lead answers
-- (getting_ready_location, ceremony_location, wedding_details, style_reason are already TEXT).
-- Widening a varchar to text is a metadata-only change in PostgreSQL: no rewrite, no data loss.
ALTER TABLE "enquiries" ALTER COLUMN "heard_about" SET DATA TYPE TEXT;
