-- Lead tasks used to get their due date from their TITLE at read time (the default schedule, N days after
-- the lead was created). Due dates are now stored on the task (so "No due date" can really mean none):
-- give every lead task that relied on the title schedule the same date explicitly. Data only, no change
-- to any date anyone sees.
UPDATE "work_items"
SET "due_anchor" = 'LEAD_CREATED',
    "due_offset_days" = CASE "title"
    WHEN 'Send initial enquiry response' THEN 1
    WHEN 'Follow up on enquiry' THEN 3
    WHEN 'Discuss shoot requirements' THEN 5
    WHEN 'Schedule client consultation' THEN 7
    WHEN 'Confirm shoot date and requirements' THEN 10
    WHEN 'Prepare client quote' THEN 12
    WHEN 'Send client quote' THEN 13
    WHEN 'Follow up on quote' THEN 16
    WHEN 'Update quote based on client request' THEN 18
    WHEN 'Send contract and deposit invoice' THEN 20
    END
WHERE "enquiry_id" IS NOT NULL
  AND "due_at" IS NULL
  AND "due_anchor" IS NULL
  AND "title" IN ('Send initial enquiry response', 'Follow up on enquiry', 'Discuss shoot requirements', 'Schedule client consultation', 'Confirm shoot date and requirements', 'Prepare client quote', 'Send client quote', 'Follow up on quote', 'Update quote based on client request', 'Send contract and deposit invoice');
