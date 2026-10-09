-- "Job complete" ticked on a lead (Studio Ninja): recorded, the lead stays in Leads. Nullable, additive.
ALTER TABLE "enquiries" ADD COLUMN "job_complete_at" TIMESTAMPTZ;
