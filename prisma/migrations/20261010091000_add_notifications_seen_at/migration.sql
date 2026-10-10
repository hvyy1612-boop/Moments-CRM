-- Per-user "notifications seen" marker for the notification bell (nullable, additive).
ALTER TABLE "users" ADD COLUMN "notifications_seen_at" TIMESTAMPTZ;
