-- The guest field now captures a full wedding-day description (parity with the website form),
-- so widen it and rename it from guest_count.
ALTER TABLE "enquiries" RENAME COLUMN "guest_count" TO "wedding_details";
ALTER TABLE "enquiries" ALTER COLUMN "wedding_details" SET DATA TYPE TEXT;
