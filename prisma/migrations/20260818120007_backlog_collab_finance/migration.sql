-- CreateEnum
CREATE TYPE "CommunicationType" AS ENUM ('EMAIL', 'NOTE', 'CLIENT_MESSAGE', 'CALL');

-- CreateEnum
CREATE TYPE "ChangeRequestType" AS ENUM ('COMMERCIAL', 'OPERATIONAL', 'CLIENT_DATA', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "ChangeRequestStatus" AS ENUM ('PENDING', 'IMPACT_ASSESSMENT', 'APPROVED', 'REJECTED', 'APPLIED');

-- CreateEnum
CREATE TYPE "FileKind" AS ENUM ('CONTRACT', 'QUESTIONNAIRE', 'RAW', 'EDITED', 'PROOF', 'GALLERY', 'INVOICE', 'OTHER');

-- CreateEnum
CREATE TYPE "FileVisibility" AS ENUM ('INTERNAL', 'CLIENT_VISIBLE');

-- CreateEnum
CREATE TYPE "QuestionnaireStatus" AS ENUM ('PENDING', 'COMPLETED');

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "rescheduled_from_id" VARCHAR(30);

-- CreateTable
CREATE TABLE "communications" (
    "id" VARCHAR(30) NOT NULL,
    "project_id" VARCHAR(30) NOT NULL,
    "client_id" VARCHAR(30),
    "type" "CommunicationType" NOT NULL,
    "direction" VARCHAR(10) NOT NULL,
    "subject" VARCHAR(255),
    "body" TEXT NOT NULL,
    "by_user_id" VARCHAR(30),
    "channel" VARCHAR(50),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "communications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" VARCHAR(30) NOT NULL,
    "project_id" VARCHAR(30) NOT NULL,
    "kind" "FileKind" NOT NULL,
    "visibility" "FileVisibility" NOT NULL DEFAULT 'INTERNAL',
    "name" VARCHAR(255) NOT NULL,
    "url" VARCHAR(2048) NOT NULL,
    "size_bytes" INTEGER,
    "uploaded_by_user_id" VARCHAR(30),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questionnaires" (
    "id" VARCHAR(30) NOT NULL,
    "project_id" VARCHAR(30) NOT NULL,
    "status" "QuestionnaireStatus" NOT NULL DEFAULT 'PENDING',
    "sent_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "questionnaires_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questionnaire_answers" (
    "id" VARCHAR(30) NOT NULL,
    "questionnaire_id" VARCHAR(30) NOT NULL,
    "question" VARCHAR(500) NOT NULL,
    "answer" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "questionnaire_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" VARCHAR(30) NOT NULL,
    "payment_id" VARCHAR(30) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'AUD',
    "reason" VARCHAR(500),
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "external_reference" VARCHAR(100),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "change_requests" (
    "id" VARCHAR(30) NOT NULL,
    "project_id" VARCHAR(30) NOT NULL,
    "type" "ChangeRequestType" NOT NULL,
    "status" "ChangeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requested_by_type" VARCHAR(10) NOT NULL,
    "requested_by_user_id" VARCHAR(30),
    "description" TEXT NOT NULL,
    "reason" VARCHAR(500),
    "commercial_impact" DECIMAL(12,2),
    "schedule_impact" BOOLEAN NOT NULL DEFAULT false,
    "resulting_quote_version_id" VARCHAR(30),
    "approved_by_user_id" VARCHAR(30),
    "approved_at" TIMESTAMPTZ,
    "rejected_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "communications_project_id_created_at_idx" ON "communications"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "files_project_id_visibility_idx" ON "files"("project_id", "visibility");

-- CreateIndex
CREATE INDEX "questionnaires_project_id_idx" ON "questionnaires"("project_id");

-- CreateIndex
CREATE INDEX "questionnaire_answers_questionnaire_id_idx" ON "questionnaire_answers"("questionnaire_id");

-- CreateIndex
CREATE INDEX "refunds_payment_id_idx" ON "refunds"("payment_id");

-- CreateIndex
CREATE INDEX "change_requests_project_id_idx" ON "change_requests"("project_id");

-- CreateIndex
CREATE INDEX "change_requests_status_idx" ON "change_requests"("status");

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_rescheduled_from_id_fkey" FOREIGN KEY ("rescheduled_from_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communications" ADD CONSTRAINT "communications_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communications" ADD CONSTRAINT "communications_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communications" ADD CONSTRAINT "communications_by_user_id_fkey" FOREIGN KEY ("by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questionnaires" ADD CONSTRAINT "questionnaires_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questionnaire_answers" ADD CONSTRAINT "questionnaire_answers_questionnaire_id_fkey" FOREIGN KEY ("questionnaire_id") REFERENCES "questionnaires"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_resulting_quote_version_id_fkey" FOREIGN KEY ("resulting_quote_version_id") REFERENCES "quote_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

