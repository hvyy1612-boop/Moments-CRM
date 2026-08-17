-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'SENT', 'SIGNED', 'SUPERSEDED', 'VOID');

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "signToken" TEXT NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "currentVersionId" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractVersion" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "documentReference" TEXT,
    "termsSnapshot" JSONB NOT NULL,
    "contentHash" TEXT,
    "createdById" TEXT,
    "signedName" TEXT,
    "signedAt" TIMESTAMPTZ,
    "signedIp" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Contract_signToken_key" ON "Contract"("signToken");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_currentVersionId_key" ON "Contract"("currentVersionId");

-- CreateIndex
CREATE INDEX "Contract_projectId_idx" ON "Contract"("projectId");

-- CreateIndex
CREATE INDEX "ContractVersion_contractId_idx" ON "ContractVersion"("contractId");

-- CreateIndex
CREATE INDEX "ContractVersion_status_idx" ON "ContractVersion"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ContractVersion_contractId_versionNumber_key" ON "ContractVersion"("contractId", "versionNumber");

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "ContractVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractVersion" ADD CONSTRAINT "ContractVersion_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractVersion" ADD CONSTRAINT "ContractVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Invariant: at most one SIGNED version per contract (a contract is signed once; amendment = new version).
CREATE UNIQUE INDEX "ContractVersion_one_signed_per_contract"
  ON "ContractVersion" ("contractId")
  WHERE status = 'SIGNED';

-- A signed contract version is immutable: once status = 'SIGNED', it can never be updated or deleted.
-- The signing UPDATE itself is allowed because OLD.status is still 'SENT' at that point.
CREATE OR REPLACE FUNCTION moments_block_signed_contract_version() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'SIGNED' THEN
    RAISE EXCEPTION 'A signed contract version is immutable (id=%)', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ContractVersion_signed_immutable"
  BEFORE UPDATE OR DELETE ON "ContractVersion"
  FOR EACH ROW EXECUTE FUNCTION moments_block_signed_contract_version();
