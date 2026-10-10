-- "Final payment received" becomes a staff task (owner, 2026-10-10: staff confirm the money, no sum decides it).
-- New jobs get it from the seeded workflow; this adds it to every job already seeded. Active jobs start it
-- Pending for staff to tick; completed / closed jobs were already settled, so it starts Done.
INSERT INTO "work_items" (
  "id", "company_id", "project_id", "kind", "stage", "type", "title", "status", "order",
  "due_anchor", "due_offset_days", "completed_at"
)
SELECT
  'c' || substr(md5(random()::text || clock_timestamp()::text || p."id"), 1, 24),
  p."company_id",
  p."id",
  'final_payment_received',
  'delivery',
  'TODO',
  'Final payment received',
  CASE WHEN p."lifecycle_status" IN ('COMPLETED', 'CLOSED') THEN 'COMPLETED'::"WorkItemStatus" ELSE 'PENDING'::"WorkItemStatus" END,
  COALESCE((SELECT max(w."order") FROM "work_items" w WHERE w."project_id" = p."id"), 0) + 1,
  'SHOOT'::"DueAnchor",
  49,
  CASE WHEN p."lifecycle_status" IN ('COMPLETED', 'CLOSED') THEN now() ELSE NULL END
FROM "projects" p
WHERE p."lifecycle_status" IN ('CONFIRMED', 'COMPLETED', 'CLOSED')
  AND EXISTS (
    SELECT 1 FROM "audit_logs" a
    WHERE a."entity_type" = 'Project' AND a."entity_id" = p."id" AND a."action" = 'project.workflow_seeded'
  )
  AND NOT EXISTS (
    SELECT 1 FROM "work_items" w WHERE w."project_id" = p."id" AND w."kind" = 'final_payment_received'
  );
