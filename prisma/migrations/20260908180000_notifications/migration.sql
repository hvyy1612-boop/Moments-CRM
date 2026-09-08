-- Notifications & reminders (docs/25 Part 4): one send-retry unit + webhook delivery events + address suppression.

CREATE TABLE "notification_dispatches" (
    "id" VARCHAR(30) NOT NULL,
    "kind" VARCHAR(40) NOT NULL,
    "target_type" VARCHAR(30) NOT NULL,
    "target_id" VARCHAR(30) NOT NULL,
    "milestone" VARCHAR(40) NOT NULL,
    "recipient_hash" VARCHAR(64) NOT NULL,
    "schedule_version" INTEGER NOT NULL DEFAULT 1,
    "dedupe_key" VARCHAR(255) NOT NULL,
    "recipient_email" VARCHAR(255) NOT NULL,
    "subject" VARCHAR(255) NOT NULL,
    "body" TEXT NOT NULL,
    "send_state" VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    "delivery_result" VARCHAR(20),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_by" VARCHAR(64),
    "locked_until" TIMESTAMPTZ,
    "lease_token" VARCHAR(64),
    "provider_idempotency_key" VARCHAR(255) NOT NULL,
    "provider_message_id" VARCHAR(255),
    "first_sent_to_provider_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notification_dispatches_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "notification_dispatches_dedupe_key_key" ON "notification_dispatches"("dedupe_key");
CREATE INDEX "notification_dispatches_send_state_idx" ON "notification_dispatches"("send_state");
CREATE INDEX "notification_dispatches_provider_message_id_idx" ON "notification_dispatches"("provider_message_id");

CREATE TABLE "notification_delivery_events" (
    "id" VARCHAR(30) NOT NULL,
    "provider_event_id" VARCHAR(255) NOT NULL,
    "provider_message_id" VARCHAR(255) NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "dispatch_id" VARCHAR(30),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notification_delivery_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "notification_delivery_events_provider_event_id_key" ON "notification_delivery_events"("provider_event_id");
CREATE INDEX "notification_delivery_events_provider_message_id_idx" ON "notification_delivery_events"("provider_message_id");

CREATE TABLE "notification_suppressions" (
    "recipient_hash" VARCHAR(64) NOT NULL,
    "recipient_email" VARCHAR(255) NOT NULL,
    "reason" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notification_suppressions_pkey" PRIMARY KEY ("recipient_hash")
);
