-- New invoice form (opened from a Job) lets staff edit the client phone and the job label per invoice
-- without changing the master Client. Store them as optional snapshots alongside the existing
-- name/email snapshots. Additive + nullable, so existing invoices are untouched.
ALTER TABLE "invoices" ADD COLUMN "billing_phone_snapshot" VARCHAR(40);
ALTER TABLE "invoices" ADD COLUMN "billing_job_name_snapshot" VARCHAR(150);
