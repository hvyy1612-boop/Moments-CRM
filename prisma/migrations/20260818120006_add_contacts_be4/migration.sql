-- CreateEnum
CREATE TYPE "ContactRole" AS ENUM ('PRIMARY', 'PARTNER', 'BILLING', 'OTHER');

-- CreateTable
CREATE TABLE "contacts" (
    "id" VARCHAR(30) NOT NULL,
    "client_id" VARCHAR(30) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "email" CITEXT,
    "phone" VARCHAR(30),
    "role" "ContactRole" NOT NULL DEFAULT 'PRIMARY',
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "is_billing" BOOLEAN NOT NULL DEFAULT false,
    "can_access_portal" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contacts_client_id_idx" ON "contacts"("client_id");

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

