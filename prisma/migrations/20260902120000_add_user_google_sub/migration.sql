-- User: store the Google subject id for staff Google sign-in (BR-G03). Nullable + unique so a user
-- may or may not have linked Google, and one Google account maps to at most one user.
ALTER TABLE "users" ADD COLUMN "google_sub" VARCHAR(255);
CREATE UNIQUE INDEX "users_google_sub_key" ON "users"("google_sub");
