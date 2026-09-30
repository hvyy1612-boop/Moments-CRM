-- Client: extra contact fields shown on the job Overview
ALTER TABLE "clients" ADD COLUMN "partner_name" VARCHAR(150);
ALTER TABLE "clients" ADD COLUMN "preferred_contact" VARCHAR(120);
ALTER TABLE "clients" ADD COLUMN "instagram" VARCHAR(100);

-- Communication: internal team note flag (not client-facing)
ALTER TABLE "communications" ADD COLUMN "internal" BOOLEAN NOT NULL DEFAULT false;

-- Project requirements
CREATE TABLE "project_requirements" (
    "id" VARCHAR(30) NOT NULL,
    "project_id" VARCHAR(30) NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "detail" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_requirements_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "project_requirements_project_id_idx" ON "project_requirements"("project_id");
ALTER TABLE "project_requirements" ADD CONSTRAINT "project_requirements_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Moodboard items
CREATE TABLE "moodboard_items" (
    "id" VARCHAR(30) NOT NULL,
    "project_id" VARCHAR(30) NOT NULL,
    "url" TEXT NOT NULL,
    "caption" VARCHAR(200),
    "kind" VARCHAR(20) NOT NULL DEFAULT 'image',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "moodboard_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "moodboard_items_project_id_idx" ON "moodboard_items"("project_id");
ALTER TABLE "moodboard_items" ADD CONSTRAINT "moodboard_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Project team members
CREATE TABLE "project_team_members" (
    "id" VARCHAR(30) NOT NULL,
    "project_id" VARCHAR(30) NOT NULL,
    "resource_id" VARCHAR(30),
    "name" VARCHAR(150) NOT NULL,
    "role" VARCHAR(80) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_team_members_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "project_team_members_project_id_idx" ON "project_team_members"("project_id");
ALTER TABLE "project_team_members" ADD CONSTRAINT "project_team_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_team_members" ADD CONSTRAINT "project_team_members_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE SET NULL ON UPDATE CASCADE;
