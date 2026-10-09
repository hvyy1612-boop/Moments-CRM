-- A job holds its own booking details (job type, occasion, source, main shoot window, location), so Add job
-- no longer needs a lead row behind it. A lead that is booked copies its details in when it becomes a Job.
ALTER TABLE "projects"
  ADD COLUMN "event_type" VARCHAR(50),
  ADD COLUMN "coverage" VARCHAR(30),
  ADD COLUMN "coverage_note" VARCHAR(300),
  ADD COLUMN "heard_about" TEXT,
  ADD COLUMN "shoot_date" DATE,
  ADD COLUMN "shoot_end_date" DATE,
  ADD COLUMN "shoot_start_time" VARCHAR(5),
  ADD COLUMN "shoot_end_time" VARCHAR(5),
  ADD COLUMN "shoot_location" VARCHAR(300);

-- Every existing job / booking file takes the details of the lead it came from (one lead per job).
UPDATE "projects" p
SET "event_type" = e."event_type",
    "coverage" = e."coverage",
    "coverage_note" = e."coverage_note",
    "heard_about" = e."heard_about",
    "shoot_date" = e."event_date",
    "shoot_end_date" = e."event_end_date",
    "shoot_start_time" = e."event_start_time",
    "shoot_end_time" = e."event_end_time",
    "shoot_location" = LEFT(COALESCE(NULLIF(btrim(e."event_location"), ''), NULLIF(btrim(split_part(e."ceremony_location", E'\n', 1)), '')), 300)
FROM "enquiries" e
WHERE e."converted_project_id" = p."id";
