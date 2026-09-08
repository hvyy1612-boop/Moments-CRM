-- Every enquiry (lead) is now tied to a Client (Studio-Ninja "Primary Client Contact"): one person = one client.
ALTER TABLE "enquiries" ADD COLUMN "client_id" VARCHAR(30);
CREATE INDEX "enquiries_client_id_idx" ON "enquiries"("client_id");
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
