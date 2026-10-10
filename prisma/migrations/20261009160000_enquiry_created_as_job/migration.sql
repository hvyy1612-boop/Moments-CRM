-- Add job (a booking already confirmed outside the app) keeps a lead row only to hold the job's details
-- (job type, source, main shoot). It was never a lead, so lists, search, alerts and the dashboard leave it
-- out (LEAD_WHERE). Unticking "Job accepted" on that job sets it back to false (a real lead).
ALTER TABLE "enquiries" ADD COLUMN "created_as_job" BOOLEAN NOT NULL DEFAULT false;

-- Existing Add job rows: a staff-entered lead confirmed into its job within two minutes of being created,
-- with no quote (a real lead is only booked by its deposit, long after it was logged).
UPDATE "enquiries" e
SET "created_as_job" = true
FROM "projects" p
WHERE e."converted_project_id" = p."id"
  AND e."source" = 'MANUAL'
  AND e."status" = 'BOOKING_CONFIRMED'
  AND p."confirmed_by_client_at" IS NOT NULL
  AND p."confirmed_by_client_at" - e."created_at" < INTERVAL '2 minutes'
  AND NOT EXISTS (SELECT 1 FROM "quotes" q WHERE q."enquiry_id" = e."id");
