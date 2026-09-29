-- Leads (the `enquiries` table) are numbered L<YYYY><4-digit> instead of E<YYYY><4-digit>, matching the
-- staff-facing "Leads" name. Data only: the digits (and so the per-company/year counter) are unchanged,
-- only the first letter is rewritten, so no number can collide with the (company_id, enquiry_number)
-- unique index. Idempotent: rows already starting with L are left alone.
UPDATE "enquiries"
SET "enquiry_number" = 'L' || substring("enquiry_number" from 2)
WHERE "enquiry_number" LIKE 'E%';
