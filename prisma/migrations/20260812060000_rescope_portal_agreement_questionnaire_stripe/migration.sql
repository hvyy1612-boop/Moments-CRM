-- Re-scoped features approved 12 Aug 2026 (BRIEF §20): client portal token, booking agreement,
-- planning questionnaire, and Stripe online payment. Additive only; no existing data is rewritten.

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('MANUAL', 'STRIPE');

-- CreateEnum
CREATE TYPE "QuestionnaireStatus" AS ENUM ('PENDING', 'SUBMITTED');

-- AlterTable (client portal access — BR-CP01)
ALTER TABLE "Booking" ADD COLUMN     "portalToken" TEXT,
ADD COLUMN     "portalTokenIssuedAt" TIMESTAMP(3);

-- AlterTable (online payment — BR-OP01..OP04; card metadata only, never a PAN — PRIV-01)
ALTER TABLE "Payment" ADD COLUMN     "provider" "PaymentProvider" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "stripePaymentIntentId" TEXT,
ADD COLUMN     "stripeChargeId" TEXT,
ADD COLUMN     "cardBrand" TEXT,
ADD COLUMN     "cardLast4" TEXT,
ADD COLUMN     "receiptUrl" TEXT,
ALTER COLUMN "recordedByUserId" DROP NOT NULL;

-- CreateTable (booking agreement — BR-AG01..AG05; insert-only, mirrors ActivityLog)
CREATE TABLE "Agreement" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "quotationVersion" INTEGER NOT NULL,
    "totalGross" DECIMAL(10,2) NOT NULL,
    "termsText" TEXT NOT NULL,
    "acceptedName" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL,
    "acceptedIp" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Agreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable (planning questionnaire — BR-QN01..QN04)
CREATE TABLE "PlanningQuestionnaire" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "status" "QuestionnaireStatus" NOT NULL DEFAULT 'PENDING',
    "responses" JSONB,
    "submittedAt" TIMESTAMP(3),
    "reminderSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanningQuestionnaire_pkey" PRIMARY KEY ("id")
);

-- CreateTable (Stripe webhook idempotency ledger — BR-OP04, BR-X08)
CREATE TABLE "StripeEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Booking_portalToken_key" ON "Booking"("portalToken");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_stripePaymentIntentId_key" ON "Payment"("stripePaymentIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "Agreement_bookingId_key" ON "Agreement"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "Agreement_quotationId_key" ON "Agreement"("quotationId");

-- CreateIndex
CREATE INDEX "Agreement_clientId_idx" ON "Agreement"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanningQuestionnaire_bookingId_key" ON "PlanningQuestionnaire"("bookingId");

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanningQuestionnaire" ADD CONSTRAINT "PlanningQuestionnaire_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
