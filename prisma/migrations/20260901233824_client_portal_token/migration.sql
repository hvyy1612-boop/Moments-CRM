-- AlterTable
ALTER TABLE "clients" ADD COLUMN "portal_token" VARCHAR(64);

-- CreateIndex
CREATE UNIQUE INDEX "clients_portal_token_key" ON "clients"("portal_token");
