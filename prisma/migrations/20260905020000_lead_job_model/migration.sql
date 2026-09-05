-- docs/24 FIX 9 + FIX 5. Non-destructive: no rows deleted, no historical data removed.

-- Legacy funnel-lifecycle Projects are actually Jobs (a Project exists only after conversion / direct
-- booking). Migrate them to operational (job) states: committed -> CONFIRMED, else BOOKING_REQUESTED.
UPDATE "projects"
SET "lifecycle_status" = (CASE
    WHEN "commercial_status" IN ('ACCEPTED', 'DEPOSIT_PAID', 'PAID') THEN 'CONFIRMED'
    ELSE 'BOOKING_REQUESTED'
  END)::"ProjectLifecycle"
WHERE "lifecycle_status" IN ('ENQUIRY', 'QUALIFYING', 'QUOTING', 'AWAITING_DECISION', 'NEGOTIATION');

-- One enquiry -> one job: a Project is the conversion target of at most one Enquiry. NULLs (unconverted
-- enquiries) are allowed and remain distinct in Postgres, so many unconverted rows are fine.
CREATE UNIQUE INDEX IF NOT EXISTS "enquiries_converted_project_id_key"
  ON "enquiries" ("converted_project_id");
