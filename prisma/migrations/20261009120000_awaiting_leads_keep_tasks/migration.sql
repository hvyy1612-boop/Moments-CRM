-- 2026-10-09: a lead whose quote is accepted but whose deposit is not paid is still a LEAD (it becomes a
-- Job when the deposit is paid). The old rule closed out its checklist when the quote was accepted; give
-- those tasks back to every lead still awaiting its deposit, exactly as "Reopen" does. Data only.
-- Declined leads get theirs back on Reopen; confirmed leads keep theirs closed (read-only lead section).
UPDATE "work_items" SET "status" = 'PENDING'
WHERE "status" = 'CANCELLED'
  AND "enquiry_id" IN (SELECT "id" FROM "enquiries" WHERE "status" = 'AWAITING_BOOKING_CONFIRMATION');
