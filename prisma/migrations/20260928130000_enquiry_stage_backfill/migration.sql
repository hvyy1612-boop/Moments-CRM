-- Data-only backfill (no schema change). Before this release, sending a quote did not advance the
-- enquiry stage, so existing leads with a genuinely sent quote can sit at an early stage that no longer
-- reflects reality. Bring them up to "Quote sent" from the quote facts. Accepted quotes already produced
-- AWAITING_BOOKING_CONFIRMATION via the conversion path, so they are left untouched here.
UPDATE "enquiries" e SET "status" = 'QUOTE_SENT'
WHERE e."status" IN ('NEW_ENQUIRY', 'CONTACTED', 'CONSULTATION')
  AND EXISTS (
    SELECT 1 FROM "quotes" q
    JOIN "quote_versions" v ON v."quote_id" = q."id"
    WHERE q."enquiry_id" = e."id" AND v."status" IN ('SENT', 'VIEWED')
  );
