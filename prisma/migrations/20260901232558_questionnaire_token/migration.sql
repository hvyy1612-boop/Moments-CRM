-- AlterTable
ALTER TABLE "questionnaires" ADD COLUMN "access_token" VARCHAR(64),
ADD COLUMN "title" VARCHAR(150);

-- CreateIndex
CREATE UNIQUE INDEX "questionnaires_access_token_key" ON "questionnaires"("access_token");
