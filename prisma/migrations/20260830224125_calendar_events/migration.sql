-- CreateTable
CREATE TABLE "calendar_events" (
    "id" VARCHAR(30) NOT NULL,
    "company_id" VARCHAR(30) NOT NULL,
    "kind" VARCHAR(20) NOT NULL DEFAULT 'APPOINTMENT',
    "title" VARCHAR(200) NOT NULL,
    "starts_at" TIMESTAMPTZ NOT NULL,
    "ends_at" TIMESTAMPTZ,
    "all_day" BOOLEAN NOT NULL DEFAULT false,
    "location" VARCHAR(255),
    "notes" TEXT,
    "client_id" VARCHAR(30),
    "created_by_user_id" VARCHAR(30),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "calendar_events_company_id_idx" ON "calendar_events"("company_id");

-- CreateIndex
CREATE INDEX "calendar_events_starts_at_idx" ON "calendar_events"("starts_at");

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
