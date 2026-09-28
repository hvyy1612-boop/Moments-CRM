-- Enquiry SALES lifecycle rebuilt to staff-facing business stages (spec): the status enum is replaced
-- and existing rows are remapped by FACTS, not just names. Recreate the type, cast the column with a
-- default mapping, then refine two cases from real quote/deposit facts.
--
--   NEW        -> NEW_ENQUIRY
--   CONTACTED  -> CONTACTED
--   QUALIFIED  -> CONSULTATION           (upgraded to QUOTE_SENT below if a quote was actually sent)
--   CONVERTED  -> BOOKING_CONFIRMED      (downgraded to AWAITING_BOOKING_CONFIRMATION if no deposit paid)
--   LOST       -> DECLINED
--   ARCHIVED   -> DECLINED

ALTER TYPE "EnquiryStatus" RENAME TO "EnquiryStatus_old";

CREATE TYPE "EnquiryStatus" AS ENUM (
  'NEW_ENQUIRY',
  'CONTACTED',
  'CONSULTATION',
  'QUOTE_SENT',
  'AWAITING_BOOKING_CONFIRMATION',
  'BOOKING_CONFIRMED',
  'DECLINED'
);

ALTER TABLE "enquiries" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "enquiries" ALTER COLUMN "status" TYPE "EnquiryStatus" USING (
  CASE "status"::text
    WHEN 'NEW' THEN 'NEW_ENQUIRY'
    WHEN 'CONTACTED' THEN 'CONTACTED'
    WHEN 'QUALIFIED' THEN 'CONSULTATION'
    WHEN 'CONVERTED' THEN 'BOOKING_CONFIRMED'
    WHEN 'LOST' THEN 'DECLINED'
    WHEN 'ARCHIVED' THEN 'DECLINED'
    ELSE 'NEW_ENQUIRY'
  END::"EnquiryStatus"
);

ALTER TABLE "enquiries" ALTER COLUMN "status" SET DEFAULT 'NEW_ENQUIRY';

DROP TYPE "EnquiryStatus_old";

-- Fact-based refinement 1: a lead that was QUALIFIED and has actually sent a quote is "Quote sent",
-- not merely in consultation.
UPDATE "enquiries" e SET "status" = 'QUOTE_SENT'
WHERE e."status" = 'CONSULTATION'
  AND EXISTS (
    SELECT 1 FROM "quotes" q
    JOIN "quote_versions" v ON v."quote_id" = q."id"
    WHERE q."enquiry_id" = e."id" AND v."status" IN ('SENT', 'VIEWED', 'ACCEPTED')
  );

-- Fact-based refinement 2: a "converted" lead is only a CONFIRMED booking once the booking deposit is
-- paid; otherwise it is still awaiting confirmation.
UPDATE "enquiries" e SET "status" = 'AWAITING_BOOKING_CONFIRMATION'
WHERE e."status" = 'BOOKING_CONFIRMED'
  AND NOT EXISTS (
    SELECT 1 FROM "projects" p
    WHERE p."id" = e."converted_project_id"
      AND p."commercial_status" IN ('DEPOSIT_PAID', 'PAID')
  );
