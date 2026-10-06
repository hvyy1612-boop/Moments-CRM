-- Staff accounts are only ACTIVE or DELETED (soft delete). PENDING / REJECTED came from the removed
-- self-registration flow; any such row is retired the same way the Users page removes an account.
UPDATE "users" SET "status" = 'DELETED', "is_active" = false WHERE "status" IN ('PENDING', 'REJECTED');
ALTER TABLE "users" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
