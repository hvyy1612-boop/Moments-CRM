-- Deadline foundation (docs/25 Part 2). Project tasks derive their due date from an anchor + offset,
-- resolved by resolveTaskDueDate; a manual date is due_override_at (Rule D1, no MANUAL anchor).

-- CreateEnum
CREATE TYPE "DueAnchor" AS ENUM ('SHOOT', 'JOB_CONFIRMED', 'FIXED');

-- AlterTable
ALTER TABLE "work_items"
  ADD COLUMN "due_anchor" "DueAnchor",
  ADD COLUMN "due_offset_days" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "due_date_fixed" TIMESTAMPTZ,
  ADD COLUMN "due_override_at" TIMESTAMPTZ,
  ADD COLUMN "booking_id" VARCHAR(30);

-- CreateIndex
CREATE INDEX "work_items_booking_id_idx" ON "work_items"("booking_id");

-- AddForeignKey
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill existing PROJECT tasks: all current project tasks are shoot-anchored; the stored due_at was a
-- manual override, and the per-title offset comes from PROJECT_TASK_SCHEDULE (generated from source).
UPDATE "work_items" SET "due_override_at" = "due_at" WHERE "project_id" IS NOT NULL AND "due_at" IS NOT NULL;

UPDATE "work_items" SET "due_anchor" = 'SHOOT' WHERE "project_id" IS NOT NULL;

UPDATE "work_items" SET "due_offset_days" = CASE "title"
    WHEN 'Send client welcome email' THEN -60
    WHEN 'Collect wedding and shoot details' THEN -45
    WHEN 'Confirm timeline and venue details' THEN -30
    WHEN 'Record special requests' THEN -30
    WHEN 'Confirm photography and video coverage' THEN -28
    WHEN 'Send pre-shoot questionnaire and reminder' THEN -21
    WHEN 'Send final payment reminder' THEN -14
    WHEN 'Review final shoot information' THEN -14
    WHEN 'Schedule final planning call' THEN -10
    WHEN 'Confirm final timeline and shoot details' THEN -7
    WHEN 'Photograph and film the wedding day' THEN 0
    WHEN 'Back up all captured files' THEN 1
    WHEN 'Prepare preview images' THEN 3
    WHEN 'Send preview gallery to client' THEN 5
    WHEN 'Cull wedding images' THEN 7
    WHEN 'Edit wedding images' THEN 21
    WHEN 'Review edited gallery' THEN 35
    WHEN 'Finalise wedding gallery' THEN 40
    WHEN 'Prepare final client deliverables' THEN 42
    WHEN 'Send final gallery to client' THEN 42
    WHEN 'Gallery delivered' THEN 42
    WHEN 'Confirm client received deliverables' THEN 45
    WHEN 'Confirm final payment received' THEN 49
    WHEN 'Send final thank-you email' THEN 50
    WHEN 'Archive project files' THEN 56
    WHEN 'Close project' THEN 56
    WHEN 'Schedule pre-wedding shoot' THEN -90
    WHEN 'Confirm pre-wedding shoot details' THEN -75
    WHEN 'Conduct pre-wedding shoot' THEN -60
    WHEN 'Back up pre-wedding images' THEN -59
    WHEN 'Edit and send pre-wedding photos' THEN -45
    WHEN 'Prepare video footage for editing' THEN 3
    WHEN 'Edit wedding film' THEN 30
    WHEN 'Colour grade wedding film' THEN 45
    WHEN 'Review final wedding film' THEN 50
    WHEN 'Finalise wedding film' THEN 55
    WHEN 'Send film for processing and scanning' THEN 2
    WHEN 'Review film scans' THEN 14
    WHEN 'Add film images to client gallery' THEN 20
    WHEN 'Prepare album design' THEN 45
    WHEN 'Send album draft to client' THEN 50
    WHEN 'Review client album changes' THEN 57
    WHEN 'Update album design' THEN 60
    WHEN 'Approve album for production' THEN 63
    WHEN 'Send album to print' THEN 65
    WHEN 'Quality check finished products' THEN 75
    ELSE 0
  END
WHERE "project_id" IS NOT NULL;
