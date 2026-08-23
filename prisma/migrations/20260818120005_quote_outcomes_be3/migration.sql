-- CreateEnum
CREATE TYPE "DeclineReason" AS ENUM ('PRICE', 'DATE_UNAVAILABLE', 'CHOSE_ANOTHER', 'PACKAGE_UNSUITABLE', 'NO_LONGER_NEED', 'OTHER');

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "lost_at" TIMESTAMPTZ,
ADD COLUMN     "lost_reason" "DeclineReason";

-- AlterTable
ALTER TABLE "quote_versions" ADD COLUMN     "decline_reason" "DeclineReason";

