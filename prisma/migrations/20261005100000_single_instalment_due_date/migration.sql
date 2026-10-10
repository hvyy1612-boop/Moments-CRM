-- A single-payment ("No split payments") invoice stored its one instalment with no due date, so the
-- payment-reminder scan (which reads instalment due dates) skipped it. New invoices now carry the date;
-- this copies the invoice's due date onto the existing single instalments. Data only, idempotent.
UPDATE "invoice_instalments" ii
SET "due_at" = i."due_at"
FROM "invoices" i
WHERE ii."invoice_id" = i."id"
  AND ii."due_at" IS NULL
  AND i."due_at" IS NOT NULL
  AND (SELECT COUNT(*) FROM "invoice_instalments" x WHERE x."invoice_id" = i."id") = 1;
