-- Record numbering (Stage 2): reformat Job / Quote / Invoice numbers to the unified scheme
-- (J/Q/INV + YYYY + 4 digits) and seed their counters. DATA-ONLY (no schema change).
-- Backfills EVERY existing record per company/year by created_at. New records already use
-- src/lib/domain/numbering.ts via nextProjectCode / createQuote(ForEnquiry) / nextInvoiceNumber.

-- Job codes: MPF-2026-0001 -> J20260001
WITH numbered AS (
  SELECT "id",
    'J' || (EXTRACT(YEAR FROM ("created_at" AT TIME ZONE 'Australia/Sydney')))::int::text ||
    LPAD((ROW_NUMBER() OVER (
      PARTITION BY "company_id", (EXTRACT(YEAR FROM ("created_at" AT TIME ZONE 'Australia/Sydney')))::int
      ORDER BY "created_at", "id"
    ))::text, 4, '0') AS num
  FROM "projects"
)
UPDATE "projects" p SET "code" = numbered.num FROM numbered WHERE p."id" = numbered."id";

-- Invoice numbers: INV-2026-0001 -> INV20260001 (company via the project)
WITH inv AS (
  SELECT i."id", pr."company_id" AS company_id, i."created_at"
  FROM "invoices" i JOIN "projects" pr ON pr."id" = i."project_id"
), numbered AS (
  SELECT "id",
    'INV' || (EXTRACT(YEAR FROM ("created_at" AT TIME ZONE 'Australia/Sydney')))::int::text ||
    LPAD((ROW_NUMBER() OVER (
      PARTITION BY company_id, (EXTRACT(YEAR FROM ("created_at" AT TIME ZONE 'Australia/Sydney')))::int
      ORDER BY "created_at", "id"
    ))::text, 4, '0') AS num
  FROM inv
)
UPDATE "invoices" i SET "invoice_number" = numbered.num FROM numbered WHERE i."id" = numbered."id";

-- Quote references: Q-0001 -> Q20260001 (company via enquiry, else project)
WITH q AS (
  SELECT qt."id", COALESCE(e."company_id", pr."company_id") AS company_id, qt."created_at"
  FROM "quotes" qt
  LEFT JOIN "enquiries" e ON e."id" = qt."enquiry_id"
  LEFT JOIN "projects" pr ON pr."id" = qt."project_id"
), numbered AS (
  SELECT "id",
    'Q' || (EXTRACT(YEAR FROM ("created_at" AT TIME ZONE 'Australia/Sydney')))::int::text ||
    LPAD((ROW_NUMBER() OVER (
      PARTITION BY company_id, (EXTRACT(YEAR FROM ("created_at" AT TIME ZONE 'Australia/Sydney')))::int
      ORDER BY "created_at", "id"
    ))::text, 4, '0') AS num
  FROM q WHERE company_id IS NOT NULL
)
UPDATE "quotes" qt SET "reference" = numbered.num FROM numbered WHERE qt."id" = numbered."id";

-- Seed the JOB / INVOICE / QUOTE counters to the highest number issued per (company, year)
INSERT INTO "number_counter" ("company_id","type","year","value")
SELECT "company_id", 'JOB'::"RecordNumberType",
       (EXTRACT(YEAR FROM ("created_at" AT TIME ZONE 'Australia/Sydney')))::int AS y, COUNT(*)::int
FROM "projects" GROUP BY "company_id", y
ON CONFLICT ("company_id","type","year") DO UPDATE SET "value" = EXCLUDED."value";

INSERT INTO "number_counter" ("company_id","type","year","value")
SELECT pr."company_id", 'INVOICE'::"RecordNumberType",
       (EXTRACT(YEAR FROM (i."created_at" AT TIME ZONE 'Australia/Sydney')))::int AS y, COUNT(*)::int
FROM "invoices" i JOIN "projects" pr ON pr."id" = i."project_id"
GROUP BY pr."company_id", y
ON CONFLICT ("company_id","type","year") DO UPDATE SET "value" = EXCLUDED."value";

INSERT INTO "number_counter" ("company_id","type","year","value")
SELECT COALESCE(e."company_id", pr."company_id") AS company_id, 'QUOTE'::"RecordNumberType",
       (EXTRACT(YEAR FROM (qt."created_at" AT TIME ZONE 'Australia/Sydney')))::int AS y, COUNT(*)::int
FROM "quotes" qt
LEFT JOIN "enquiries" e ON e."id" = qt."enquiry_id"
LEFT JOIN "projects" pr ON pr."id" = qt."project_id"
WHERE COALESCE(e."company_id", pr."company_id") IS NOT NULL
GROUP BY COALESCE(e."company_id", pr."company_id"), y
ON CONFLICT ("company_id","type","year") DO UPDATE SET "value" = EXCLUDED."value";
