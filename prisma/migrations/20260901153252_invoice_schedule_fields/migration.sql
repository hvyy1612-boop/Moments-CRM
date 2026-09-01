-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "invoice_date" TIMESTAMPTZ,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "po_number" VARCHAR(60);

-- CreateTable
CREATE TABLE "invoice_instalments" (
    "id" VARCHAR(30) NOT NULL,
    "invoice_id" VARCHAR(30) NOT NULL,
    "label" VARCHAR(100),
    "due_at" TIMESTAMPTZ,
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'UNPAID',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_instalments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invoice_instalments_invoice_id_idx" ON "invoice_instalments"("invoice_id");

-- AddForeignKey
ALTER TABLE "invoice_instalments" ADD CONSTRAINT "invoice_instalments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
