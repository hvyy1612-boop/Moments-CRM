-- Track which staff last edited a communication (internal notes) and when
ALTER TABLE "communications" ADD COLUMN "edited_by_user_id" VARCHAR(30);
ALTER TABLE "communications" ADD COLUMN "edited_at" TIMESTAMPTZ;
ALTER TABLE "communications" ADD CONSTRAINT "communications_edited_by_user_id_fkey" FOREIGN KEY ("edited_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
