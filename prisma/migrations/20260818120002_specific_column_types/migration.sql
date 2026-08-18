-- Give every column an explicit type: varchar(n) bounds, citext for email, text for free
-- notes, numeric/int/bool/timestamptz/enum/jsonb unchanged. See docs/17-data-dictionary.md.
-- The anti-double-booking EXCLUDE depends on resource_id, so drop it, alter, recreate it.

-- Drop the exclusion constraint before altering resource_id (Postgres blocks type change otherwise).
ALTER TABLE "resource_assignments" DROP CONSTRAINT "ResourceAssignment_no_overlap";

-- DropForeignKey
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_actor_user_id_fkey";

-- DropForeignKey
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_company_id_fkey";

-- DropForeignKey
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_project_id_fkey";

-- DropForeignKey
ALTER TABLE "clients" DROP CONSTRAINT "clients_company_id_fkey";

-- DropForeignKey
ALTER TABLE "contract_versions" DROP CONSTRAINT "contract_versions_contract_id_fkey";

-- DropForeignKey
ALTER TABLE "contract_versions" DROP CONSTRAINT "contract_versions_created_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "contracts" DROP CONSTRAINT "contracts_current_version_id_fkey";

-- DropForeignKey
ALTER TABLE "contracts" DROP CONSTRAINT "contracts_project_id_fkey";

-- DropForeignKey
ALTER TABLE "galleries" DROP CONSTRAINT "galleries_project_id_fkey";

-- DropForeignKey
ALTER TABLE "gallery_items" DROP CONSTRAINT "gallery_items_gallery_id_fkey";

-- DropForeignKey
ALTER TABLE "invoice_lines" DROP CONSTRAINT "invoice_lines_invoice_id_fkey";

-- DropForeignKey
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_project_id_fkey";

-- DropForeignKey
ALTER TABLE "password_resets" DROP CONSTRAINT "password_resets_user_id_fkey";

-- DropForeignKey
ALTER TABLE "payment_transactions" DROP CONSTRAINT "payment_transactions_payment_id_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_invoice_id_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_project_id_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_recorded_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "projects" DROP CONSTRAINT "projects_client_id_fkey";

-- DropForeignKey
ALTER TABLE "projects" DROP CONSTRAINT "projects_company_id_fkey";

-- DropForeignKey
ALTER TABLE "projects" DROP CONSTRAINT "projects_owner_user_id_fkey";

-- DropForeignKey
ALTER TABLE "quote_lines" DROP CONSTRAINT "quote_lines_quote_version_id_fkey";

-- DropForeignKey
ALTER TABLE "quote_versions" DROP CONSTRAINT "quote_versions_created_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "quote_versions" DROP CONSTRAINT "quote_versions_quote_id_fkey";

-- DropForeignKey
ALTER TABLE "quotes" DROP CONSTRAINT "quotes_current_version_id_fkey";

-- DropForeignKey
ALTER TABLE "quotes" DROP CONSTRAINT "quotes_project_id_fkey";

-- DropForeignKey
ALTER TABLE "resource_assignments" DROP CONSTRAINT "resource_assignments_assigned_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "resource_assignments" DROP CONSTRAINT "resource_assignments_booking_id_fkey";

-- DropForeignKey
ALTER TABLE "resource_assignments" DROP CONSTRAINT "resource_assignments_resource_id_fkey";

-- DropForeignKey
ALTER TABLE "resources" DROP CONSTRAINT "resources_company_id_fkey";

-- DropForeignKey
ALTER TABLE "resources" DROP CONSTRAINT "resources_linked_user_id_fkey";

-- DropForeignKey
ALTER TABLE "security_events" DROP CONSTRAINT "security_events_user_id_fkey";

-- DropForeignKey
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_user_id_fkey";

-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_company_id_fkey";

-- AlterTable
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "company_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "actor_user_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "action" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "entity_type" SET DATA TYPE VARCHAR(50),
ALTER COLUMN "entity_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "reason" SET DATA TYPE VARCHAR(500),
ALTER COLUMN "source" SET DATA TYPE VARCHAR(50),
ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "company_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "project_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "title" SET DATA TYPE VARCHAR(200),
ALTER COLUMN "timezone" SET DATA TYPE VARCHAR(50),
ALTER COLUMN "location" SET DATA TYPE VARCHAR(255),
ADD CONSTRAINT "bookings_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "clients" DROP CONSTRAINT "clients_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "company_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "display_name" SET DATA TYPE VARCHAR(150),
ALTER COLUMN "legal_name" SET DATA TYPE VARCHAR(150),
ALTER COLUMN "phone" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "suburb" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "state" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "postcode" SET DATA TYPE VARCHAR(20),
ADD CONSTRAINT "clients_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "companies" DROP CONSTRAINT "companies_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "name" SET DATA TYPE VARCHAR(150),
ALTER COLUMN "abn" SET DATA TYPE VARCHAR(20),
ALTER COLUMN "timezone" SET DATA TYPE VARCHAR(50),
ALTER COLUMN "currency" SET DATA TYPE VARCHAR(3),
ADD CONSTRAINT "companies_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "contract_versions" DROP CONSTRAINT "contract_versions_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "contract_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "document_reference" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "content_hash" SET DATA TYPE VARCHAR(64),
ALTER COLUMN "created_by_user_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "signed_by_client_name" SET DATA TYPE VARCHAR(150),
ALTER COLUMN "signed_by_client_ip" SET DATA TYPE VARCHAR(45),
ADD CONSTRAINT "contract_versions_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "contracts" DROP CONSTRAINT "contracts_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "project_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "sign_token" SET DATA TYPE VARCHAR(64),
ALTER COLUMN "current_version_id" SET DATA TYPE VARCHAR(30),
ADD CONSTRAINT "contracts_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "galleries" DROP CONSTRAINT "galleries_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "project_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "title" SET DATA TYPE VARCHAR(200),
ALTER COLUMN "access_token" SET DATA TYPE VARCHAR(64),
ADD CONSTRAINT "galleries_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "gallery_items" DROP CONSTRAINT "gallery_items_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "gallery_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "caption" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "url" SET DATA TYPE VARCHAR(2048),
ADD CONSTRAINT "gallery_items_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "invoice_lines" DROP CONSTRAINT "invoice_lines_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "invoice_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "description" SET DATA TYPE VARCHAR(500),
ALTER COLUMN "source" SET DATA TYPE VARCHAR(50),
ADD CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "project_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "invoice_number" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "currency" SET DATA TYPE VARCHAR(3),
ALTER COLUMN "billing_name_snapshot" SET DATA TYPE VARCHAR(150),
ALTER COLUMN "billing_email_snapshot" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "void_reason" SET DATA TYPE VARCHAR(500),
ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "outbox_events" DROP CONSTRAINT "outbox_events_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "event_type" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "aggregate_type" SET DATA TYPE VARCHAR(50),
ALTER COLUMN "aggregate_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "correlation_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "causation_id" SET DATA TYPE VARCHAR(30),
ADD CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "password_resets" DROP CONSTRAINT "password_resets_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "user_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "token_hash" SET DATA TYPE VARCHAR(64),
ALTER COLUMN "requested_ip" SET DATA TYPE VARCHAR(45),
ADD CONSTRAINT "password_resets_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "payment_transactions" DROP CONSTRAINT "payment_transactions_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "payment_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "provider" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "external_transaction_id" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "currency" SET DATA TYPE VARCHAR(3),
ADD CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "payments" DROP CONSTRAINT "payments_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "invoice_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "project_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "currency" SET DATA TYPE VARCHAR(3),
ALTER COLUMN "recorded_by_user_id" SET DATA TYPE VARCHAR(30),
ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "projects" DROP CONSTRAINT "projects_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "company_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "client_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "code" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "name" SET DATA TYPE VARCHAR(200),
ALTER COLUMN "owner_user_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "source" SET DATA TYPE VARCHAR(50),
ALTER COLUMN "source_detail" SET DATA TYPE VARCHAR(255),
ADD CONSTRAINT "projects_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "quote_lines" DROP CONSTRAINT "quote_lines_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "quote_version_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "line_type" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "reference_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "description" SET DATA TYPE VARCHAR(500),
ADD CONSTRAINT "quote_lines_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "quote_versions" DROP CONSTRAINT "quote_versions_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "quote_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "currency" SET DATA TYPE VARCHAR(3),
ALTER COLUMN "created_by_user_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "accepted_by_client_name" SET DATA TYPE VARCHAR(150),
ALTER COLUMN "accepted_by_client_ip" SET DATA TYPE VARCHAR(45),
ADD CONSTRAINT "quote_versions_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "quotes" DROP CONSTRAINT "quotes_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "project_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "view_token" SET DATA TYPE VARCHAR(64),
ALTER COLUMN "current_version_id" SET DATA TYPE VARCHAR(30),
ADD CONSTRAINT "quotes_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "resource_assignments" DROP CONSTRAINT "resource_assignments_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "booking_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "resource_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "role" SET DATA TYPE VARCHAR(50),
ALTER COLUMN "assigned_by_user_id" SET DATA TYPE VARCHAR(30),
ADD CONSTRAINT "resource_assignments_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "resources" DROP CONSTRAINT "resources_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "company_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "name" SET DATA TYPE VARCHAR(150),
ALTER COLUMN "linked_user_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "status" SET DATA TYPE VARCHAR(30),
ADD CONSTRAINT "resources_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "security_events" DROP CONSTRAINT "security_events_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "event_type" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "user_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "ip_address" SET DATA TYPE VARCHAR(45),
ALTER COLUMN "user_agent" SET DATA TYPE VARCHAR(400),
ADD CONSTRAINT "security_events_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "user_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "token_hash" SET DATA TYPE VARCHAR(64),
ALTER COLUMN "user_agent" SET DATA TYPE VARCHAR(400),
ALTER COLUMN "ip_address" SET DATA TYPE VARCHAR(45),
ADD CONSTRAINT "sessions_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "users" DROP CONSTRAINT "users_pkey",
ALTER COLUMN "id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "company_id" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "password_hash" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "password_algo" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "name" SET DATA TYPE VARCHAR(150),
ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_current_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "quote_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_versions" ADD CONSTRAINT "quote_versions_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_versions" ADD CONSTRAINT "quote_versions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_quote_version_id_fkey" FOREIGN KEY ("quote_version_id") REFERENCES "quote_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_current_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "contract_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_versions" ADD CONSTRAINT "contract_versions_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_versions" ADD CONSTRAINT "contract_versions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_linked_user_id_fkey" FOREIGN KEY ("linked_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_assignments" ADD CONSTRAINT "resource_assignments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_assignments" ADD CONSTRAINT "resource_assignments_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_assignments" ADD CONSTRAINT "resource_assignments_assigned_by_user_id_fkey" FOREIGN KEY ("assigned_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "galleries" ADD CONSTRAINT "galleries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gallery_items" ADD CONSTRAINT "gallery_items_gallery_id_fkey" FOREIGN KEY ("gallery_id") REFERENCES "galleries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Recreate the anti-double-booking invariant (snake_case columns; unchanged semantics).
ALTER TABLE "resource_assignments"
  ADD CONSTRAINT "ResourceAssignment_no_overlap"
  EXCLUDE USING gist (
    resource_id WITH =,
    tstzrange(starts_at, ends_at) WITH &&
  ) WHERE (status = 'ACTIVE');
