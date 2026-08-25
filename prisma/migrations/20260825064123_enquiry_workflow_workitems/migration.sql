-- CreateEnum
CREATE TYPE "WorkItemStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "communications" ADD COLUMN     "enquiry_id" VARCHAR(30),
ALTER COLUMN "project_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "work_items" (
    "id" VARCHAR(30) NOT NULL,
    "company_id" VARCHAR(30) NOT NULL,
    "enquiry_id" VARCHAR(30),
    "project_id" VARCHAR(30),
    "kind" VARCHAR(50) NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "status" "WorkItemStatus" NOT NULL DEFAULT 'PENDING',
    "order" INTEGER NOT NULL DEFAULT 0,
    "completed_by_user_id" VARCHAR(30),
    "completed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "work_items_enquiry_id_idx" ON "work_items"("enquiry_id");

-- CreateIndex
CREATE INDEX "work_items_project_id_idx" ON "work_items"("project_id");

-- CreateIndex
CREATE INDEX "communications_enquiry_id_created_at_idx" ON "communications"("enquiry_id", "created_at");

-- AddForeignKey
ALTER TABLE "communications" ADD CONSTRAINT "communications_enquiry_id_fkey" FOREIGN KEY ("enquiry_id") REFERENCES "enquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_enquiry_id_fkey" FOREIGN KEY ("enquiry_id") REFERENCES "enquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_completed_by_user_id_fkey" FOREIGN KEY ("completed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
