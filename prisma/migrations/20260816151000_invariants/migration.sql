-- Invariant: at most one ACCEPTED quote version per quote (BR: one accepted commercial version)
CREATE UNIQUE INDEX "QuoteVersion_one_accepted_per_quote"
  ON "QuoteVersion" ("quoteId")
  WHERE status = 'ACCEPTED';

-- Append-only: AuditLog and SecurityEvent may only be inserted, never updated or deleted.
CREATE OR REPLACE FUNCTION moments_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Table % is insert-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditLog_insert_only"
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION moments_block_mutation();

CREATE TRIGGER "SecurityEvent_insert_only"
  BEFORE UPDATE OR DELETE ON "SecurityEvent"
  FOR EACH ROW EXECUTE FUNCTION moments_block_mutation();
