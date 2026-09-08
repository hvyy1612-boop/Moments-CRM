-- AlterTable: wedding-enquiry detail fields (parity with the public website enquiry form). All nullable.
ALTER TABLE "enquiries"
  ADD COLUMN "partner_name" VARCHAR(150),
  ADD COLUMN "coverage" VARCHAR(30),
  ADD COLUMN "getting_ready_location" TEXT,
  ADD COLUMN "ceremony_location" TEXT,
  ADD COLUMN "guest_count" VARCHAR(100),
  ADD COLUMN "style_reason" TEXT,
  ADD COLUMN "heard_about" VARCHAR(120);
