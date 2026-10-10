-- Task due dates (Studio Ninja style): a lead task can be due N days after the lead was created.
-- Kept in its own migration: Postgres cannot use a new enum value in the transaction that adds it.
ALTER TYPE "DueAnchor" ADD VALUE IF NOT EXISTS 'LEAD_CREATED';
