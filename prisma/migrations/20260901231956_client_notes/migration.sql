-- CreateTable
CREATE TABLE "client_notes" (
    "id" VARCHAR(30) NOT NULL,
    "client_id" VARCHAR(30) NOT NULL,
    "title" VARCHAR(150),
    "body" TEXT NOT NULL,
    "created_by_user_id" VARCHAR(30),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_notes_client_id_idx" ON "client_notes"("client_id");

-- AddForeignKey
ALTER TABLE "client_notes" ADD CONSTRAINT "client_notes_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_notes" ADD CONSTRAINT "client_notes_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
