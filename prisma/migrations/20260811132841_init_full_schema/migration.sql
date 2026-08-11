-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'STUDIO', 'EDITOR');

-- CreateEnum
CREATE TYPE "CrewRole" AS ENUM ('PHOTOGRAPHER', 'VIDEOGRAPHER', 'SECOND_SHOOTER');

-- CreateEnum
CREATE TYPE "EnquiryStatus" AS ENUM ('NEW', 'CONTACTED', 'QUOTED', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING_BOOKING_FEE', 'CONFIRMED', 'DELIVERED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliverableType" AS ENUM ('SNEAK_PEEK', 'PHOTO_GALLERY', 'VIDEO_FILM', 'ALBUM', 'FILM_SCANS', 'PORTRAIT_GALLERY', 'RAW_FOOTAGE');

-- CreateEnum
CREATE TYPE "DeliverableStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'DELIVERED', 'CLOSED');

-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('BOOKING_FEE', 'BALANCE', 'ADDITIONAL');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('BANK_TRANSFER', 'CARD', 'CASH', 'OTHER');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED', 'SENT', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('SYSTEM', 'STAFF', 'CLIENT');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('PACKAGE', 'ADDON', 'RULE', 'MANUAL');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'SMS');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" CITEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "passwordAlgo" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "passwordChangedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordReset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "requestedIp" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordReset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "absoluteExpiresAt" TIMESTAMP(3) NOT NULL,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrewMember" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" CITEXT,
    "crewRole" "CrewRole" NOT NULL,
    "userId" TEXT,
    "isContractor" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CrewMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "primaryName" TEXT NOT NULL,
    "partnerName" TEXT,
    "email" CITEXT NOT NULL,
    "phone" TEXT,
    "suburb" TEXT,
    "state" TEXT,
    "postcode" TEXT,
    "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
    "consentUpdatedAt" TIMESTAMP(3),
    "anonymisedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enquiry" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "enquiryType" TEXT NOT NULL,
    "eventDate" TIMESTAMP(3) NOT NULL,
    "venueName" TEXT,
    "venueSuburb" TEXT,
    "venueDistanceKm" DECIMAL(6,1),
    "guestCount" INTEGER,
    "budgetIndication" DECIMAL(10,2),
    "source" TEXT,
    "message" TEXT,
    "status" "EnquiryStatus" NOT NULL DEFAULT 'NEW',
    "assignedUserId" TEXT,
    "firstRespondedAt" TIMESTAMP(3),
    "lostReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Enquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnquiryPackage" (
    "enquiryId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,

    CONSTRAINT "EnquiryPackage_pkey" PRIMARY KEY ("enquiryId","packageId")
);

-- CreateTable
CREATE TABLE "Package" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priceGross" DECIMAL(10,2) NOT NULL,
    "includedHours" INTEGER NOT NULL,
    "includedTravelKm" INTEGER NOT NULL,
    "maxExtraHours" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AddOn" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priceGrossBefore" DECIMAL(10,2) NOT NULL,
    "priceGrossAfter" DECIMAL(10,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AddOn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AddOnRule" (
    "id" TEXT NOT NULL,
    "addOnId" TEXT NOT NULL,
    "requiresAnyPackageId" TEXT[],
    "excludesPackageId" TEXT[],

    CONSTRAINT "AddOnRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingRule" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ruleType" TEXT NOT NULL,
    "requiresAllPackageId" TEXT[],
    "excludesPackageId" TEXT[],
    "appliesToTargetId" TEXT,
    "discountType" "DiscountType" NOT NULL,
    "discountValue" DECIMAL(10,2) NOT NULL,
    "evaluationOrder" INTEGER NOT NULL DEFAULT 0,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PricingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quotation" (
    "id" TEXT NOT NULL,
    "enquiryId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "viewToken" TEXT NOT NULL,
    "totalGross" DECIMAL(10,2) NOT NULL,
    "gstAmount" DECIMAL(10,2) NOT NULL,
    "validUntil" TIMESTAMP(3),
    "requiresManualPricing" BOOLEAN NOT NULL DEFAULT false,
    "cancellationPolicySnapshot" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "firstViewedAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "supersededById" TEXT,
    "termsAcknowledgedAt" TIMESTAMP(3),
    "termsAcknowledgedIp" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Quotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationAction" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "QuotationAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationLine" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "sourceType" "SourceType" NOT NULL,
    "sourceId" TEXT,
    "description" TEXT NOT NULL,
    "unitPriceGross" DECIMAL(10,2) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "lineTotalGross" DECIMAL(10,2) NOT NULL,
    "appliedRuleId" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QuotationLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING_BOOKING_FEE',
    "shootDate" TIMESTAMP(3) NOT NULL,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "venueName" TEXT,
    "venueAddress" TEXT,
    "coverageHours" INTEGER NOT NULL,
    "leadPhotographerId" TEXT,
    "leadVideographerId" TEXT,
    "secondShooterId" TEXT,
    "dateLockedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingDateChange" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "previousDate" TIMESTAMP(3) NOT NULL,
    "newDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "changedBy" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingDateChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deliverable" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "type" "DeliverableType" NOT NULL,
    "status" "DeliverableStatus" NOT NULL DEFAULT 'PENDING',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "assignedCrewId" TEXT,
    "galleryUrl" TEXT,
    "galleryPasswordHash" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "galleryExpiresAt" TIMESTAMP(3),
    "backupExpiresAt" TIMESTAMP(3),
    "clientAcknowledgedAt" TIMESTAMP(3),

    CONSTRAINT "Deliverable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "type" "InvoiceType" NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "totalGross" DECIMAL(10,2) NOT NULL,
    "gstAmount" DECIMAL(10,2) NOT NULL,
    "amountPaid" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "buyerName" TEXT NOT NULL,
    "supplierAbn" TEXT NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amountGross" DECIMAL(10,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "receivedDate" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "recordedByUserId" TEXT NOT NULL,
    "reversesPaymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeRequest" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "requestedByType" "ActorType" NOT NULL,
    "requestType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priceImpactGross" DECIMAL(10,2),
    "status" TEXT NOT NULL,
    "resultingQuotationId" TEXT,
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "relatedType" TEXT NOT NULL,
    "relatedId" TEXT NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "detailJson" JSONB NOT NULL,
    "ipAddress" TEXT,
    "visibleToClient" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityEvent" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "userId" TEXT,
    "emailAttempted" CITEXT,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT,
    "outcome" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "userId" TEXT,
    "channel" "NotificationChannel" NOT NULL,
    "templateKey" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT,
    "bodyText" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "cancelledReason" TEXT,
    "relatedType" TEXT NOT NULL,
    "relatedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "PasswordReset_userId_idx" ON "PasswordReset"("userId");

-- CreateIndex
CREATE INDEX "PasswordReset_tokenHash_idx" ON "PasswordReset"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_tokenHash_idx" ON "Session"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "CrewMember_userId_key" ON "CrewMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Client_email_key" ON "Client"("email");

-- CreateIndex
CREATE INDEX "Client_email_idx" ON "Client"("email");

-- CreateIndex
CREATE INDEX "Enquiry_clientId_idx" ON "Enquiry"("clientId");

-- CreateIndex
CREATE INDEX "Enquiry_status_idx" ON "Enquiry"("status");

-- CreateIndex
CREATE INDEX "Enquiry_eventDate_idx" ON "Enquiry"("eventDate");

-- CreateIndex
CREATE UNIQUE INDEX "Package_code_key" ON "Package"("code");

-- CreateIndex
CREATE INDEX "Package_isActive_displayOrder_idx" ON "Package"("isActive", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "AddOn_code_key" ON "AddOn"("code");

-- CreateIndex
CREATE INDEX "AddOn_isActive_displayOrder_idx" ON "AddOn"("isActive", "displayOrder");

-- CreateIndex
CREATE INDEX "AddOnRule_addOnId_idx" ON "AddOnRule"("addOnId");

-- CreateIndex
CREATE UNIQUE INDEX "PricingRule_code_key" ON "PricingRule"("code");

-- CreateIndex
CREATE INDEX "PricingRule_isActive_evaluationOrder_idx" ON "PricingRule"("isActive", "evaluationOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_viewToken_key" ON "Quotation"("viewToken");

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_supersededById_key" ON "Quotation"("supersededById");

-- CreateIndex
CREATE INDEX "Quotation_enquiryId_idx" ON "Quotation"("enquiryId");

-- CreateIndex
CREATE INDEX "Quotation_status_idx" ON "Quotation"("status");

-- CreateIndex
CREATE INDEX "QuotationAction_quotationId_idx" ON "QuotationAction"("quotationId");

-- CreateIndex
CREATE INDEX "QuotationAction_tokenHash_idx" ON "QuotationAction"("tokenHash");

-- CreateIndex
CREATE INDEX "QuotationLine_quotationId_idx" ON "QuotationLine"("quotationId");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_quotationId_key" ON "Booking"("quotationId");

-- CreateIndex
CREATE INDEX "Booking_clientId_idx" ON "Booking"("clientId");

-- CreateIndex
CREATE INDEX "Booking_status_idx" ON "Booking"("status");

-- CreateIndex
CREATE INDEX "Booking_shootDate_idx" ON "Booking"("shootDate");

-- CreateIndex
CREATE INDEX "BookingDateChange_bookingId_idx" ON "BookingDateChange"("bookingId");

-- CreateIndex
CREATE INDEX "Deliverable_bookingId_idx" ON "Deliverable"("bookingId");

-- CreateIndex
CREATE INDEX "Deliverable_status_idx" ON "Deliverable"("status");

-- CreateIndex
CREATE INDEX "Deliverable_dueDate_idx" ON "Deliverable"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "Invoice_bookingId_idx" ON "Invoice"("bookingId");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX "Invoice_dueDate_idx" ON "Invoice"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_reversesPaymentId_key" ON "Payment"("reversesPaymentId");

-- CreateIndex
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");

-- CreateIndex
CREATE INDEX "ChangeRequest_bookingId_idx" ON "ChangeRequest"("bookingId");

-- CreateIndex
CREATE INDEX "ChangeRequest_status_idx" ON "ChangeRequest"("status");

-- CreateIndex
CREATE INDEX "ActivityLog_clientId_idx" ON "ActivityLog"("clientId");

-- CreateIndex
CREATE INDEX "ActivityLog_relatedType_relatedId_idx" ON "ActivityLog"("relatedType", "relatedId");

-- CreateIndex
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");

-- CreateIndex
CREATE INDEX "SecurityEvent_userId_idx" ON "SecurityEvent"("userId");

-- CreateIndex
CREATE INDEX "SecurityEvent_eventType_idx" ON "SecurityEvent"("eventType");

-- CreateIndex
CREATE INDEX "SecurityEvent_createdAt_idx" ON "SecurityEvent"("createdAt");

-- CreateIndex
CREATE INDEX "Notification_status_scheduledFor_idx" ON "Notification"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "Notification_relatedType_relatedId_idx" ON "Notification"("relatedType", "relatedId");

-- CreateIndex
CREATE INDEX "Notification_clientId_idx" ON "Notification"("clientId");

-- AddForeignKey
ALTER TABLE "PasswordReset" ADD CONSTRAINT "PasswordReset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrewMember" ADD CONSTRAINT "CrewMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enquiry" ADD CONSTRAINT "Enquiry_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enquiry" ADD CONSTRAINT "Enquiry_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnquiryPackage" ADD CONSTRAINT "EnquiryPackage_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "Enquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnquiryPackage" ADD CONSTRAINT "EnquiryPackage_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AddOnRule" ADD CONSTRAINT "AddOnRule_addOnId_fkey" FOREIGN KEY ("addOnId") REFERENCES "AddOn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "Enquiry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "Quotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationAction" ADD CONSTRAINT "QuotationAction_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationLine" ADD CONSTRAINT "QuotationLine_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_leadPhotographerId_fkey" FOREIGN KEY ("leadPhotographerId") REFERENCES "CrewMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_leadVideographerId_fkey" FOREIGN KEY ("leadVideographerId") REFERENCES "CrewMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_secondShooterId_fkey" FOREIGN KEY ("secondShooterId") REFERENCES "CrewMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingDateChange" ADD CONSTRAINT "BookingDateChange_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deliverable" ADD CONSTRAINT "Deliverable_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deliverable" ADD CONSTRAINT "Deliverable_assignedCrewId_fkey" FOREIGN KEY ("assignedCrewId") REFERENCES "CrewMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_reversesPaymentId_fkey" FOREIGN KEY ("reversesPaymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_resultingQuotationId_fkey" FOREIGN KEY ("resultingQuotationId") REFERENCES "Quotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityEvent" ADD CONSTRAINT "SecurityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- Raw SQL beyond Prisma's schema expressiveness (ADR-0003, §6).
-- ============================================================================

-- BR-P14: at most one ACCEPTED quotation per enquiry.
CREATE UNIQUE INDEX "Quotation_one_accepted_per_enquiry"
    ON "Quotation" ("enquiryId")
    WHERE "status" = 'ACCEPTED'::"QuotationStatus";

-- BR-B05: no crew member holds two CONFIRMED bookings on the same shoot date.
-- A plain partial unique index cannot express "the same crew id across any of three slots",
-- so a trigger enforces it at the database level (the brief's intent).
CREATE OR REPLACE FUNCTION check_crew_double_booking()
RETURNS TRIGGER AS $$
DECLARE
    conflicts INTEGER;
BEGIN
    IF NEW."status" = 'CONFIRMED'::"BookingStatus" THEN
        SELECT COUNT(*) INTO conflicts
        FROM "Booking" b
        WHERE b."id" <> NEW."id"
          AND b."status" = 'CONFIRMED'::"BookingStatus"
          AND b."shootDate"::date = NEW."shootDate"::date
          AND (
              (NEW."leadPhotographerId" IS NOT NULL AND NEW."leadPhotographerId" IN (b."leadPhotographerId", b."leadVideographerId", b."secondShooterId"))
           OR (NEW."leadVideographerId" IS NOT NULL AND NEW."leadVideographerId" IN (b."leadPhotographerId", b."leadVideographerId", b."secondShooterId"))
           OR (NEW."secondShooterId"   IS NOT NULL AND NEW."secondShooterId"   IN (b."leadPhotographerId", b."leadVideographerId", b."secondShooterId"))
          );
        IF conflicts > 0 THEN
            RAISE EXCEPTION 'BR-B05: a crew member already has a CONFIRMED booking on %', NEW."shootDate"::date
                USING ERRCODE = 'unique_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER booking_crew_double_booking
    BEFORE INSERT OR UPDATE ON "Booking"
    FOR EACH ROW EXECUTE FUNCTION check_crew_double_booking();

-- BR-L01 / ADR-0003: ActivityLog and SecurityEvent are insert-only.
CREATE OR REPLACE FUNCTION prevent_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION '% is insert-only (BR-L01, ADR-0003): % is not permitted', TG_TABLE_NAME, TG_OP
        USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER activitylog_immutable
    BEFORE UPDATE OR DELETE ON "ActivityLog"
    FOR EACH ROW EXECUTE FUNCTION prevent_mutation();

CREATE TRIGGER securityevent_immutable
    BEFORE UPDATE OR DELETE ON "SecurityEvent"
    FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
