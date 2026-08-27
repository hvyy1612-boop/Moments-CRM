ALTER TABLE "users" ADD COLUMN "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING';
UPDATE "users" SET "status"='ACTIVE' WHERE "is_active"=true;
