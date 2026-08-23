-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ProjectLifecycle" ADD VALUE 'NEGOTIATION';
ALTER TYPE "ProjectLifecycle" ADD VALUE 'BOOKING_REQUESTED';
ALTER TYPE "ProjectLifecycle" ADD VALUE 'LOST';
ALTER TYPE "ProjectLifecycle" ADD VALUE 'ON_HOLD';
ALTER TYPE "ProjectLifecycle" ADD VALUE 'POSTPONED';
ALTER TYPE "ProjectLifecycle" ADD VALUE 'ARCHIVED';

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "confirm_token" VARCHAR(64),
ADD COLUMN     "confirmed_by_client_at" TIMESTAMPTZ,
ADD COLUMN     "package_id" VARCHAR(30),
ADD COLUMN     "package_price_snapshot" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "packages" (
    "id" VARCHAR(30) NOT NULL,
    "company_id" VARCHAR(30) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "inclusions" TEXT,
    "duration_hours" INTEGER,
    "base_price_incl_gst" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "packages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "packages_company_id_active_idx" ON "packages"("company_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "projects_confirm_token_key" ON "projects"("confirm_token");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packages" ADD CONSTRAINT "packages_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

