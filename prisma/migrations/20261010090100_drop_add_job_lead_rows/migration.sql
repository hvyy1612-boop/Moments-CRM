-- Applied after the code that reads Project booking details is live (the previous release still read
-- enquiries.created_as_job, so this runs as a second step).
-- The rows behind earlier Add jobs were never leads; their job now holds the details, so they go. Any note
-- or message on them moves to the job first; their cancelled lead tasks go with them.
UPDATE "communications" c
SET "project_id" = e."converted_project_id", "enquiry_id" = NULL
FROM "enquiries" e
WHERE c."enquiry_id" = e."id" AND e."created_as_job" = true AND e."converted_project_id" IS NOT NULL;
DELETE FROM "enquiries" WHERE "created_as_job" = true;
ALTER TABLE "enquiries" DROP COLUMN "created_as_job";
