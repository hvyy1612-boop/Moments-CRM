-- CreditNote: reduces an issued invoice's obligation (docs/25 Rule M2/M8), original document preserved.
-- NOT a refund (cash out lives in Refund / PaymentTransaction).

-- CreateTable
CREATE TABLE "credit_notes" (
    "id" VARCHAR(30) NOT NULL,
    "invoice_id" VARCHAR(30) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" VARCHAR(500),
    "status" VARCHAR(20) NOT NULL DEFAULT 'SUCCEEDED',
    "issued_by_user_id" VARCHAR(30),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "credit_notes_invoice_id_idx" ON "credit_notes"("invoice_id");

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
