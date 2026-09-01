-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "access_token" VARCHAR(64);

-- CreateTable
CREATE TABLE "invoice_templates" (
    "id" VARCHAR(30) NOT NULL,
    "company_id" VARCHAR(30) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "lines_json" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invoice_templates_company_id_idx" ON "invoice_templates"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_access_token_key" ON "invoices"("access_token");

-- AddForeignKey
ALTER TABLE "invoice_templates" ADD CONSTRAINT "invoice_templates_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
