-- CreateEnum
CREATE TYPE "EnquiryStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'LOST', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EnquirySource" AS ENUM ('WEBSITE', 'REFERRAL', 'INSTAGRAM', 'MANUAL', 'OTHER');

-- CreateEnum
CREATE TYPE "ClientSource" AS ENUM ('DIRECT_BOOKING', 'ENQUIRY', 'REFERRAL', 'MANUAL', 'OTHER');

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "merged_into_client_id" VARCHAR(30),
ADD COLUMN     "source" "ClientSource" NOT NULL DEFAULT 'MANUAL';

-- CreateTable
CREATE TABLE "enquiries" (
    "id" VARCHAR(30) NOT NULL,
    "company_id" VARCHAR(30) NOT NULL,
    "owner_user_id" VARCHAR(30),
    "name" VARCHAR(150) NOT NULL,
    "email" CITEXT NOT NULL,
    "phone" VARCHAR(30),
    "event_type" VARCHAR(50),
    "event_date" DATE,
    "message" TEXT,
    "source" "EnquirySource" NOT NULL DEFAULT 'WEBSITE',
    "status" "EnquiryStatus" NOT NULL DEFAULT 'NEW',
    "lost_reason" VARCHAR(500),
    "converted_client_id" VARCHAR(30),
    "converted_project_id" VARCHAR(30),
    "converted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enquiries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "enquiries_company_id_idx" ON "enquiries"("company_id");

-- CreateIndex
CREATE INDEX "enquiries_status_idx" ON "enquiries"("status");

-- CreateIndex
CREATE INDEX "enquiries_email_idx" ON "enquiries"("email");

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_merged_into_client_id_fkey" FOREIGN KEY ("merged_into_client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_converted_client_id_fkey" FOREIGN KEY ("converted_client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_converted_project_id_fkey" FOREIGN KEY ("converted_project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

