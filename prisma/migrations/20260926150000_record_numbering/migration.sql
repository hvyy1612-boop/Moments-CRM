-- Record numbering (Stage 1): per-(company × type × year) counter + human numbers for Client & Enquiry.
-- ADDITIVE ONLY. Deliberately does NOT drop quotes_seq_key / enquiries_converted_project_id_key /
-- playing_with_neon (pre-existing drift owned by other in-flight work) — this migration is independent.

-- CreateEnum
CREATE TYPE "RecordNumberType" AS ENUM ('CLIENT', 'ENQUIRY', 'QUOTE', 'JOB', 'INVOICE');

-- CreateTable
CREATE TABLE "number_counter" (
    "company_id" VARCHAR(30) NOT NULL,
    "type" "RecordNumberType" NOT NULL,
    "year" INTEGER NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "number_counter_pkey" PRIMARY KEY ("company_id","type","year")
);

-- AddForeignKey
ALTER TABLE "number_counter" ADD CONSTRAINT "number_counter_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "clients" ADD COLUMN "client_number" VARCHAR(20);
ALTER TABLE "enquiries" ADD COLUMN "enquiry_number" VARCHAR(20);

-- Backfill existing clients: C<sydney-year><4-digit>, sequential per company/year by created_at
WITH numbered AS (
  SELECT "id",
    'C' || (EXTRACT(YEAR FROM ("created_at" AT TIME ZONE 'Australia/Sydney')))::int::text ||
    LPAD((ROW_NUMBER() OVER (
      PARTITION BY "company_id", (EXTRACT(YEAR FROM ("created_at" AT TIME ZONE 'Australia/Sydney')))::int
      ORDER BY "created_at", "id"
    ))::text, 4, '0') AS num
  FROM "clients"
)
UPDATE "clients" c SET "client_number" = numbered.num FROM numbered WHERE c."id" = numbered."id";

-- Backfill existing enquiries: E<sydney-year><4-digit>
WITH numbered AS (
  SELECT "id",
    'E' || (EXTRACT(YEAR FROM ("created_at" AT TIME ZONE 'Australia/Sydney')))::int::text ||
    LPAD((ROW_NUMBER() OVER (
      PARTITION BY "company_id", (EXTRACT(YEAR FROM ("created_at" AT TIME ZONE 'Australia/Sydney')))::int
      ORDER BY "created_at", "id"
    ))::text, 4, '0') AS num
  FROM "enquiries"
)
UPDATE "enquiries" e SET "enquiry_number" = numbered.num FROM numbered WHERE e."id" = numbered."id";

-- Seed counters to the highest number already issued per (company, year) so new records continue cleanly
INSERT INTO "number_counter" ("company_id","type","year","value")
SELECT "company_id", 'CLIENT'::"RecordNumberType",
       (EXTRACT(YEAR FROM ("created_at" AT TIME ZONE 'Australia/Sydney')))::int AS y, COUNT(*)::int
FROM "clients" GROUP BY "company_id", y
ON CONFLICT ("company_id","type","year") DO UPDATE SET "value" = EXCLUDED."value";

INSERT INTO "number_counter" ("company_id","type","year","value")
SELECT "company_id", 'ENQUIRY'::"RecordNumberType",
       (EXTRACT(YEAR FROM ("created_at" AT TIME ZONE 'Australia/Sydney')))::int AS y, COUNT(*)::int
FROM "enquiries" GROUP BY "company_id", y
ON CONFLICT ("company_id","type","year") DO UPDATE SET "value" = EXCLUDED."value";

-- CreateIndex (after backfill so existing rows already hold unique values)
CREATE UNIQUE INDEX "clients_company_id_client_number_key" ON "clients"("company_id", "client_number");
CREATE UNIQUE INDEX "enquiries_company_id_enquiry_number_key" ON "enquiries"("company_id", "enquiry_number");
