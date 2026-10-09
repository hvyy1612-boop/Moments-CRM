-- Staff Add lead form (Studio-Ninja style): job type "Other" note + the main shoot window and location.
-- Additive and nullable only; existing leads keep working (no times = all day, no date = not confirmed).
ALTER TABLE "enquiries" ADD COLUMN "coverage_note" VARCHAR(300);
ALTER TABLE "enquiries" ADD COLUMN "event_end_date" DATE;
ALTER TABLE "enquiries" ADD COLUMN "event_start_time" VARCHAR(5);
ALTER TABLE "enquiries" ADD COLUMN "event_end_time" VARCHAR(5);
ALTER TABLE "enquiries" ADD COLUMN "event_location" VARCHAR(300);
