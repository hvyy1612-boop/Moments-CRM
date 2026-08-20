-- AlterTable
ALTER TABLE "audit_logs" RENAME CONSTRAINT "AuditLog_pkey" TO "audit_logs_pkey";

-- AlterTable
ALTER TABLE "bookings" RENAME CONSTRAINT "Booking_pkey" TO "bookings_pkey";

-- AlterTable
ALTER TABLE "clients" RENAME CONSTRAINT "Client_pkey" TO "clients_pkey";

-- AlterTable
ALTER TABLE "companies" RENAME CONSTRAINT "Company_pkey" TO "companies_pkey";

-- AlterTable
ALTER TABLE "contract_versions" RENAME CONSTRAINT "ContractVersion_pkey" TO "contract_versions_pkey";

-- AlterTable
ALTER TABLE "contracts" RENAME CONSTRAINT "Contract_pkey" TO "contracts_pkey";

-- AlterTable
ALTER TABLE "galleries" RENAME CONSTRAINT "Gallery_pkey" TO "galleries_pkey";

-- AlterTable
ALTER TABLE "gallery_items" RENAME CONSTRAINT "GalleryItem_pkey" TO "gallery_items_pkey";

-- AlterTable
ALTER TABLE "invoice_lines" RENAME CONSTRAINT "InvoiceLine_pkey" TO "invoice_lines_pkey";

-- AlterTable
ALTER TABLE "invoices" RENAME CONSTRAINT "Invoice_pkey" TO "invoices_pkey";

-- AlterTable
ALTER TABLE "outbox_events" RENAME CONSTRAINT "OutboxEvent_pkey" TO "outbox_events_pkey";

-- AlterTable
ALTER TABLE "password_resets" RENAME CONSTRAINT "PasswordReset_pkey" TO "password_resets_pkey";

-- AlterTable
ALTER TABLE "payment_transactions" RENAME CONSTRAINT "PaymentTransaction_pkey" TO "payment_transactions_pkey";

-- AlterTable
ALTER TABLE "payments" RENAME CONSTRAINT "Payment_pkey" TO "payments_pkey";

-- AlterTable
ALTER TABLE "projects" RENAME CONSTRAINT "Project_pkey" TO "projects_pkey";

-- AlterTable
ALTER TABLE "quote_lines" RENAME CONSTRAINT "QuoteLine_pkey" TO "quote_lines_pkey";

-- AlterTable
ALTER TABLE "quote_versions" RENAME CONSTRAINT "QuoteVersion_pkey" TO "quote_versions_pkey";

-- AlterTable
ALTER TABLE "quotes" RENAME CONSTRAINT "Quote_pkey" TO "quotes_pkey";

-- AlterTable
ALTER TABLE "resource_assignments" RENAME CONSTRAINT "ResourceAssignment_pkey" TO "resource_assignments_pkey";

-- AlterTable
ALTER TABLE "resources" RENAME CONSTRAINT "Resource_pkey" TO "resources_pkey";

-- AlterTable
ALTER TABLE "security_events" RENAME CONSTRAINT "SecurityEvent_pkey" TO "security_events_pkey";

-- AlterTable
ALTER TABLE "sessions" RENAME CONSTRAINT "Session_pkey" TO "sessions_pkey";

-- AlterTable
ALTER TABLE "users" RENAME CONSTRAINT "User_pkey" TO "users_pkey";

-- RenameForeignKey
ALTER TABLE "audit_logs" RENAME CONSTRAINT "AuditLog_actorUserId_fkey" TO "audit_logs_actor_user_id_fkey";

-- RenameForeignKey
ALTER TABLE "bookings" RENAME CONSTRAINT "Booking_companyId_fkey" TO "bookings_company_id_fkey";

-- RenameForeignKey
ALTER TABLE "bookings" RENAME CONSTRAINT "Booking_projectId_fkey" TO "bookings_project_id_fkey";

-- RenameForeignKey
ALTER TABLE "clients" RENAME CONSTRAINT "Client_companyId_fkey" TO "clients_company_id_fkey";

-- RenameForeignKey
ALTER TABLE "contract_versions" RENAME CONSTRAINT "ContractVersion_contractId_fkey" TO "contract_versions_contract_id_fkey";

-- RenameForeignKey
ALTER TABLE "contract_versions" RENAME CONSTRAINT "ContractVersion_createdById_fkey" TO "contract_versions_created_by_user_id_fkey";

-- RenameForeignKey
ALTER TABLE "contracts" RENAME CONSTRAINT "Contract_currentVersionId_fkey" TO "contracts_current_version_id_fkey";

-- RenameForeignKey
ALTER TABLE "contracts" RENAME CONSTRAINT "Contract_projectId_fkey" TO "contracts_project_id_fkey";

-- RenameForeignKey
ALTER TABLE "galleries" RENAME CONSTRAINT "Gallery_projectId_fkey" TO "galleries_project_id_fkey";

-- RenameForeignKey
ALTER TABLE "gallery_items" RENAME CONSTRAINT "GalleryItem_galleryId_fkey" TO "gallery_items_gallery_id_fkey";

-- RenameForeignKey
ALTER TABLE "invoice_lines" RENAME CONSTRAINT "InvoiceLine_invoiceId_fkey" TO "invoice_lines_invoice_id_fkey";

-- RenameForeignKey
ALTER TABLE "invoices" RENAME CONSTRAINT "Invoice_projectId_fkey" TO "invoices_project_id_fkey";

-- RenameForeignKey
ALTER TABLE "password_resets" RENAME CONSTRAINT "PasswordReset_userId_fkey" TO "password_resets_user_id_fkey";

-- RenameForeignKey
ALTER TABLE "payment_transactions" RENAME CONSTRAINT "PaymentTransaction_paymentId_fkey" TO "payment_transactions_payment_id_fkey";

-- RenameForeignKey
ALTER TABLE "payments" RENAME CONSTRAINT "Payment_invoiceId_fkey" TO "payments_invoice_id_fkey";

-- RenameForeignKey
ALTER TABLE "payments" RENAME CONSTRAINT "Payment_projectId_fkey" TO "payments_project_id_fkey";

-- RenameForeignKey
ALTER TABLE "payments" RENAME CONSTRAINT "Payment_recordedByUserId_fkey" TO "payments_recorded_by_user_id_fkey";

-- RenameForeignKey
ALTER TABLE "projects" RENAME CONSTRAINT "Project_clientId_fkey" TO "projects_client_id_fkey";

-- RenameForeignKey
ALTER TABLE "projects" RENAME CONSTRAINT "Project_companyId_fkey" TO "projects_company_id_fkey";

-- RenameForeignKey
ALTER TABLE "projects" RENAME CONSTRAINT "Project_ownerUserId_fkey" TO "projects_owner_user_id_fkey";

-- RenameForeignKey
ALTER TABLE "quote_lines" RENAME CONSTRAINT "QuoteLine_quoteVersionId_fkey" TO "quote_lines_quote_version_id_fkey";

-- RenameForeignKey
ALTER TABLE "quote_versions" RENAME CONSTRAINT "QuoteVersion_createdById_fkey" TO "quote_versions_created_by_user_id_fkey";

-- RenameForeignKey
ALTER TABLE "quote_versions" RENAME CONSTRAINT "QuoteVersion_quoteId_fkey" TO "quote_versions_quote_id_fkey";

-- RenameForeignKey
ALTER TABLE "quotes" RENAME CONSTRAINT "Quote_currentVersionId_fkey" TO "quotes_current_version_id_fkey";

-- RenameForeignKey
ALTER TABLE "quotes" RENAME CONSTRAINT "Quote_projectId_fkey" TO "quotes_project_id_fkey";

-- RenameForeignKey
ALTER TABLE "resource_assignments" RENAME CONSTRAINT "ResourceAssignment_assignedById_fkey" TO "resource_assignments_assigned_by_user_id_fkey";

-- RenameForeignKey
ALTER TABLE "resource_assignments" RENAME CONSTRAINT "ResourceAssignment_bookingId_fkey" TO "resource_assignments_booking_id_fkey";

-- RenameForeignKey
ALTER TABLE "resource_assignments" RENAME CONSTRAINT "ResourceAssignment_resourceId_fkey" TO "resource_assignments_resource_id_fkey";

-- RenameForeignKey
ALTER TABLE "resources" RENAME CONSTRAINT "Resource_companyId_fkey" TO "resources_company_id_fkey";

-- RenameForeignKey
ALTER TABLE "resources" RENAME CONSTRAINT "Resource_linkedUserId_fkey" TO "resources_linked_user_id_fkey";

-- RenameForeignKey
ALTER TABLE "security_events" RENAME CONSTRAINT "SecurityEvent_userId_fkey" TO "security_events_user_id_fkey";

-- RenameForeignKey
ALTER TABLE "sessions" RENAME CONSTRAINT "Session_userId_fkey" TO "sessions_user_id_fkey";

-- RenameForeignKey
ALTER TABLE "users" RENAME CONSTRAINT "User_companyId_fkey" TO "users_company_id_fkey";

-- RenameIndex
ALTER INDEX "AuditLog_createdAt_idx" RENAME TO "audit_logs_created_at_idx";

-- RenameIndex
ALTER INDEX "AuditLog_entityType_entityId_idx" RENAME TO "audit_logs_entity_type_entity_id_idx";

-- RenameIndex
ALTER INDEX "Booking_projectId_idx" RENAME TO "bookings_project_id_idx";

-- RenameIndex
ALTER INDEX "Booking_startsAt_idx" RENAME TO "bookings_starts_at_idx";

-- RenameIndex
ALTER INDEX "Booking_status_idx" RENAME TO "bookings_status_idx";

-- RenameIndex
ALTER INDEX "Client_companyId_idx" RENAME TO "clients_company_id_idx";

-- RenameIndex
ALTER INDEX "Client_email_key" RENAME TO "clients_email_key";

-- RenameIndex
ALTER INDEX "Client_status_idx" RENAME TO "clients_status_idx";

-- RenameIndex
ALTER INDEX "ContractVersion_contractId_idx" RENAME TO "contract_versions_contract_id_idx";

-- RenameIndex
ALTER INDEX "ContractVersion_contractId_versionNumber_key" RENAME TO "contract_versions_contract_id_version_number_key";

-- RenameIndex
ALTER INDEX "ContractVersion_status_idx" RENAME TO "contract_versions_status_idx";

-- RenameIndex
ALTER INDEX "Contract_currentVersionId_key" RENAME TO "contracts_current_version_id_key";

-- RenameIndex
ALTER INDEX "Contract_projectId_idx" RENAME TO "contracts_project_id_idx";

-- RenameIndex
ALTER INDEX "Contract_signToken_key" RENAME TO "contracts_sign_token_key";

-- RenameIndex
ALTER INDEX "Gallery_accessToken_key" RENAME TO "galleries_access_token_key";

-- RenameIndex
ALTER INDEX "Gallery_projectId_idx" RENAME TO "galleries_project_id_idx";

-- RenameIndex
ALTER INDEX "GalleryItem_galleryId_idx" RENAME TO "gallery_items_gallery_id_idx";

-- RenameIndex
ALTER INDEX "InvoiceLine_invoiceId_idx" RENAME TO "invoice_lines_invoice_id_idx";

-- RenameIndex
ALTER INDEX "Invoice_dueAt_idx" RENAME TO "invoices_due_at_idx";

-- RenameIndex
ALTER INDEX "Invoice_invoiceNumber_key" RENAME TO "invoices_invoice_number_key";

-- RenameIndex
ALTER INDEX "Invoice_projectId_idx" RENAME TO "invoices_project_id_idx";

-- RenameIndex
ALTER INDEX "Invoice_status_idx" RENAME TO "invoices_status_idx";

-- RenameIndex
ALTER INDEX "OutboxEvent_status_availableAt_idx" RENAME TO "outbox_events_status_available_at_idx";

-- RenameIndex
ALTER INDEX "PasswordReset_tokenHash_idx" RENAME TO "password_resets_token_hash_idx";

-- RenameIndex
ALTER INDEX "PasswordReset_userId_idx" RENAME TO "password_resets_user_id_idx";

-- RenameIndex
ALTER INDEX "PaymentTransaction_paymentId_idx" RENAME TO "payment_transactions_payment_id_idx";

-- RenameIndex
ALTER INDEX "Payment_invoiceId_idx" RENAME TO "payments_invoice_id_idx";

-- RenameIndex
ALTER INDEX "Payment_projectId_idx" RENAME TO "payments_project_id_idx";

-- RenameIndex
ALTER INDEX "Project_clientId_idx" RENAME TO "projects_client_id_idx";

-- RenameIndex
ALTER INDEX "Project_code_key" RENAME TO "projects_code_key";

-- RenameIndex
ALTER INDEX "Project_companyId_idx" RENAME TO "projects_company_id_idx";

-- RenameIndex
ALTER INDEX "Project_enquiryReceivedAt_idx" RENAME TO "projects_enquiry_received_at_idx";

-- RenameIndex
ALTER INDEX "Project_lifecycleStatus_idx" RENAME TO "projects_lifecycle_status_idx";

-- RenameIndex
ALTER INDEX "QuoteLine_quoteVersionId_idx" RENAME TO "quote_lines_quote_version_id_idx";

-- RenameIndex
ALTER INDEX "QuoteVersion_quoteId_idx" RENAME TO "quote_versions_quote_id_idx";

-- RenameIndex
ALTER INDEX "QuoteVersion_quoteId_versionNumber_key" RENAME TO "quote_versions_quote_id_version_number_key";

-- RenameIndex
ALTER INDEX "QuoteVersion_status_idx" RENAME TO "quote_versions_status_idx";

-- RenameIndex
ALTER INDEX "Quote_currentVersionId_key" RENAME TO "quotes_current_version_id_key";

-- RenameIndex
ALTER INDEX "Quote_projectId_idx" RENAME TO "quotes_project_id_idx";

-- RenameIndex
ALTER INDEX "Quote_viewToken_key" RENAME TO "quotes_view_token_key";

-- RenameIndex
ALTER INDEX "ResourceAssignment_bookingId_idx" RENAME TO "resource_assignments_booking_id_idx";

-- RenameIndex
ALTER INDEX "ResourceAssignment_resourceId_idx" RENAME TO "resource_assignments_resource_id_idx";

-- RenameIndex
ALTER INDEX "Resource_companyId_resourceType_idx" RENAME TO "resources_company_id_resource_type_idx";

-- RenameIndex
ALTER INDEX "SecurityEvent_createdAt_idx" RENAME TO "security_events_created_at_idx";

-- RenameIndex
ALTER INDEX "SecurityEvent_eventType_idx" RENAME TO "security_events_event_type_idx";

-- RenameIndex
ALTER INDEX "SecurityEvent_userId_idx" RENAME TO "security_events_user_id_idx";

-- RenameIndex
ALTER INDEX "Session_tokenHash_idx" RENAME TO "sessions_token_hash_idx";

-- RenameIndex
ALTER INDEX "Session_userId_idx" RENAME TO "sessions_user_id_idx";

-- RenameIndex
ALTER INDEX "User_companyId_idx" RENAME TO "users_company_id_idx";

-- RenameIndex
ALTER INDEX "User_email_key" RENAME TO "users_email_key";

-- RenameIndex
ALTER INDEX "User_role_idx" RENAME TO "users_role_idx";
