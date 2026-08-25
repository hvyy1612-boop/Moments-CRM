-- CreateEnum
CREATE TYPE "WaitingOn" AS ENUM ('STUDIO', 'CLIENT');

-- AlterTable
ALTER TABLE "enquiries" ADD COLUMN     "waiting_on" "WaitingOn";

-- Backfill operational owner for existing leads (closed leads stay NULL).
-- NEW/QUALIFIED = the studio owes the next action; CONTACTED = the studio has replied, waiting on the client.
UPDATE "enquiries" SET "waiting_on" = 'STUDIO' WHERE "status" IN ('NEW', 'QUALIFIED');
UPDATE "enquiries" SET "waiting_on" = 'CLIENT' WHERE "status" = 'CONTACTED';
