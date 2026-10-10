-- Source values nothing sets any more (2026-10-06): a lead comes only from the website form (WEBSITE)
-- or from staff (MANUAL); "Direct booking" as a client source belonged to a removed feature.
-- Rows are moved off the removed values first so this is safe on any database.
BEGIN;

UPDATE "enquiries" SET "source" = 'MANUAL' WHERE "source"::text IN ('REFERRAL', 'INSTAGRAM', 'OTHER');
UPDATE "clients" SET "source" = 'MANUAL' WHERE "source"::text = 'DIRECT_BOOKING';

CREATE TYPE "ClientSource_new" AS ENUM ('ENQUIRY', 'REFERRAL', 'MANUAL', 'OTHER');
ALTER TABLE "clients" ALTER COLUMN "source" DROP DEFAULT;
ALTER TABLE "clients" ALTER COLUMN "source" TYPE "ClientSource_new" USING ("source"::text::"ClientSource_new");
ALTER TYPE "ClientSource" RENAME TO "ClientSource_old";
ALTER TYPE "ClientSource_new" RENAME TO "ClientSource";
DROP TYPE "ClientSource_old";
ALTER TABLE "clients" ALTER COLUMN "source" SET DEFAULT 'MANUAL';

CREATE TYPE "EnquirySource_new" AS ENUM ('WEBSITE', 'MANUAL');
ALTER TABLE "enquiries" ALTER COLUMN "source" DROP DEFAULT;
ALTER TABLE "enquiries" ALTER COLUMN "source" TYPE "EnquirySource_new" USING ("source"::text::"EnquirySource_new");
ALTER TYPE "EnquirySource" RENAME TO "EnquirySource_old";
ALTER TYPE "EnquirySource_new" RENAME TO "EnquirySource";
DROP TYPE "EnquirySource_old";
ALTER TABLE "enquiries" ALTER COLUMN "source" SET DEFAULT 'WEBSITE';

COMMIT;
