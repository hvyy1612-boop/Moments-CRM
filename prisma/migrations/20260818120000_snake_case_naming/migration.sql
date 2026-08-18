-- Rename tables and columns to snake_case (data-preserving). See docs/17-data-dictionary.md.
-- RENAME keeps rows, FKs, indexes, triggers and the EXCLUDE constraint intact.

-- 1) Tables -> snake_case plural
ALTER TABLE "Company" RENAME TO companies;
ALTER TABLE "User" RENAME TO users;
ALTER TABLE "PasswordReset" RENAME TO password_resets;
ALTER TABLE "Session" RENAME TO sessions;
ALTER TABLE "SecurityEvent" RENAME TO security_events;
ALTER TABLE "Client" RENAME TO clients;
ALTER TABLE "Project" RENAME TO projects;
ALTER TABLE "Quote" RENAME TO quotes;
ALTER TABLE "QuoteVersion" RENAME TO quote_versions;
ALTER TABLE "QuoteLine" RENAME TO quote_lines;
ALTER TABLE "Contract" RENAME TO contracts;
ALTER TABLE "ContractVersion" RENAME TO contract_versions;
ALTER TABLE "Booking" RENAME TO bookings;
ALTER TABLE "Resource" RENAME TO resources;
ALTER TABLE "ResourceAssignment" RENAME TO resource_assignments;
ALTER TABLE "Invoice" RENAME TO invoices;
ALTER TABLE "InvoiceLine" RENAME TO invoice_lines;
ALTER TABLE "Payment" RENAME TO payments;
ALTER TABLE "PaymentTransaction" RENAME TO payment_transactions;
ALTER TABLE "Gallery" RENAME TO galleries;
ALTER TABLE "GalleryItem" RENAME TO gallery_items;
ALTER TABLE "AuditLog" RENAME TO audit_logs;
ALTER TABLE "OutboxEvent" RENAME TO outbox_events;

-- 2) Columns -> snake_case
-- companies
ALTER TABLE companies RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE companies RENAME COLUMN "updatedAt" TO updated_at;
-- users
ALTER TABLE users RENAME COLUMN "companyId" TO company_id;
ALTER TABLE users RENAME COLUMN "passwordHash" TO password_hash;
ALTER TABLE users RENAME COLUMN "passwordAlgo" TO password_algo;
ALTER TABLE users RENAME COLUMN "isActive" TO is_active;
ALTER TABLE users RENAME COLUMN "mustChangePassword" TO must_change_password;
ALTER TABLE users RENAME COLUMN "lastLoginAt" TO last_login_at;
ALTER TABLE users RENAME COLUMN "failedAttempts" TO failed_attempts;
ALTER TABLE users RENAME COLUMN "lockedUntil" TO locked_until;
ALTER TABLE users RENAME COLUMN "passwordChangedAt" TO password_changed_at;
ALTER TABLE users RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE users RENAME COLUMN "updatedAt" TO updated_at;
-- password_resets
ALTER TABLE password_resets RENAME COLUMN "userId" TO user_id;
ALTER TABLE password_resets RENAME COLUMN "tokenHash" TO token_hash;
ALTER TABLE password_resets RENAME COLUMN "expiresAt" TO expires_at;
ALTER TABLE password_resets RENAME COLUMN "usedAt" TO used_at;
ALTER TABLE password_resets RENAME COLUMN "requestedIp" TO requested_ip;
ALTER TABLE password_resets RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE password_resets RENAME COLUMN "updatedAt" TO updated_at;
-- sessions
ALTER TABLE sessions RENAME COLUMN "userId" TO user_id;
ALTER TABLE sessions RENAME COLUMN "tokenHash" TO token_hash;
ALTER TABLE sessions RENAME COLUMN "expiresAt" TO expires_at;
ALTER TABLE sessions RENAME COLUMN "absoluteExpiresAt" TO absolute_expires_at;
ALTER TABLE sessions RENAME COLUMN "lastActiveAt" TO last_active_at;
ALTER TABLE sessions RENAME COLUMN "userAgent" TO user_agent;
ALTER TABLE sessions RENAME COLUMN "ipAddress" TO ip_address;
ALTER TABLE sessions RENAME COLUMN "revokedAt" TO revoked_at;
ALTER TABLE sessions RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE sessions RENAME COLUMN "updatedAt" TO updated_at;
-- security_events
ALTER TABLE security_events RENAME COLUMN "eventType" TO event_type;
ALTER TABLE security_events RENAME COLUMN "userId" TO user_id;
ALTER TABLE security_events RENAME COLUMN "emailAttempted" TO email_attempted;
ALTER TABLE security_events RENAME COLUMN "ipAddress" TO ip_address;
ALTER TABLE security_events RENAME COLUMN "userAgent" TO user_agent;
ALTER TABLE security_events RENAME COLUMN "createdAt" TO created_at;
-- clients
ALTER TABLE clients RENAME COLUMN "companyId" TO company_id;
ALTER TABLE clients RENAME COLUMN "displayName" TO display_name;
ALTER TABLE clients RENAME COLUMN "legalName" TO legal_name;
ALTER TABLE clients RENAME COLUMN "marketingConsent" TO marketing_consent;
ALTER TABLE clients RENAME COLUMN "consentUpdatedAt" TO consent_updated_at;
ALTER TABLE clients RENAME COLUMN "anonymisedAt" TO anonymised_at;
ALTER TABLE clients RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE clients RENAME COLUMN "updatedAt" TO updated_at;
ALTER TABLE clients RENAME COLUMN "archivedAt" TO archived_at;
-- projects
ALTER TABLE projects RENAME COLUMN "companyId" TO company_id;
ALTER TABLE projects RENAME COLUMN "clientId" TO client_id;
ALTER TABLE projects RENAME COLUMN "ownerUserId" TO owner_user_id;
ALTER TABLE projects RENAME COLUMN "lifecycleStatus" TO lifecycle_status;
ALTER TABLE projects RENAME COLUMN "commercialStatus" TO commercial_status;
ALTER TABLE projects RENAME COLUMN "sourceDetail" TO source_detail;
ALTER TABLE projects RENAME COLUMN "enquiryReceivedAt" TO enquiry_received_at;
ALTER TABLE projects RENAME COLUMN "enquiryNotes" TO enquiry_notes;
ALTER TABLE projects RENAME COLUMN "firstRespondedAt" TO first_responded_at;
ALTER TABLE projects RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE projects RENAME COLUMN "updatedAt" TO updated_at;
ALTER TABLE projects RENAME COLUMN "archivedAt" TO archived_at;
-- quotes
ALTER TABLE quotes RENAME COLUMN "projectId" TO project_id;
ALTER TABLE quotes RENAME COLUMN "viewToken" TO view_token;
ALTER TABLE quotes RENAME COLUMN "currentVersionId" TO current_version_id;
ALTER TABLE quotes RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE quotes RENAME COLUMN "updatedAt" TO updated_at;
-- quote_versions
ALTER TABLE quote_versions RENAME COLUMN "quoteId" TO quote_id;
ALTER TABLE quote_versions RENAME COLUMN "versionNumber" TO version_number;
ALTER TABLE quote_versions RENAME COLUMN "discountTotal" TO discount_total;
ALTER TABLE quote_versions RENAME COLUMN "taxTotal" TO tax_total;
ALTER TABLE quote_versions RENAME COLUMN "validUntil" TO valid_until;
ALTER TABLE quote_versions RENAME COLUMN "createdById" TO created_by_user_id;
ALTER TABLE quote_versions RENAME COLUMN "sentAt" TO sent_to_client_at;
ALTER TABLE quote_versions RENAME COLUMN "viewedAt" TO viewed_by_client_at;
ALTER TABLE quote_versions RENAME COLUMN "acceptedAt" TO accepted_by_client_at;
ALTER TABLE quote_versions RENAME COLUMN "acceptedName" TO accepted_by_client_name;
ALTER TABLE quote_versions RENAME COLUMN "acceptedIp" TO accepted_by_client_ip;
ALTER TABLE quote_versions RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE quote_versions RENAME COLUMN "updatedAt" TO updated_at;
-- quote_lines
ALTER TABLE quote_lines RENAME COLUMN "quoteVersionId" TO quote_version_id;
ALTER TABLE quote_lines RENAME COLUMN "lineType" TO line_type;
ALTER TABLE quote_lines RENAME COLUMN "referenceId" TO reference_id;
ALTER TABLE quote_lines RENAME COLUMN "unitPrice" TO unit_price;
ALTER TABLE quote_lines RENAME COLUMN "lineTotal" TO line_total;
ALTER TABLE quote_lines RENAME COLUMN "sortOrder" TO sort_order;
ALTER TABLE quote_lines RENAME COLUMN "createdAt" TO created_at;
-- contracts
ALTER TABLE contracts RENAME COLUMN "projectId" TO project_id;
ALTER TABLE contracts RENAME COLUMN "signToken" TO sign_token;
ALTER TABLE contracts RENAME COLUMN "currentVersionId" TO current_version_id;
ALTER TABLE contracts RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE contracts RENAME COLUMN "updatedAt" TO updated_at;
-- contract_versions
ALTER TABLE contract_versions RENAME COLUMN "contractId" TO contract_id;
ALTER TABLE contract_versions RENAME COLUMN "versionNumber" TO version_number;
ALTER TABLE contract_versions RENAME COLUMN "documentReference" TO document_reference;
ALTER TABLE contract_versions RENAME COLUMN "termsSnapshot" TO terms_snapshot;
ALTER TABLE contract_versions RENAME COLUMN "contentHash" TO content_hash;
ALTER TABLE contract_versions RENAME COLUMN "createdById" TO created_by_user_id;
ALTER TABLE contract_versions RENAME COLUMN "signedName" TO signed_by_client_name;
ALTER TABLE contract_versions RENAME COLUMN "signedAt" TO signed_by_client_at;
ALTER TABLE contract_versions RENAME COLUMN "signedIp" TO signed_by_client_ip;
ALTER TABLE contract_versions RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE contract_versions RENAME COLUMN "updatedAt" TO updated_at;
-- bookings
ALTER TABLE bookings RENAME COLUMN "companyId" TO company_id;
ALTER TABLE bookings RENAME COLUMN "projectId" TO project_id;
ALTER TABLE bookings RENAME COLUMN "startsAt" TO starts_at;
ALTER TABLE bookings RENAME COLUMN "endsAt" TO ends_at;
ALTER TABLE bookings RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE bookings RENAME COLUMN "updatedAt" TO updated_at;
ALTER TABLE bookings RENAME COLUMN "cancelledAt" TO cancelled_at;
-- resources
ALTER TABLE resources RENAME COLUMN "companyId" TO company_id;
ALTER TABLE resources RENAME COLUMN "resourceType" TO resource_type;
ALTER TABLE resources RENAME COLUMN "linkedUserId" TO linked_user_id;
ALTER TABLE resources RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE resources RENAME COLUMN "updatedAt" TO updated_at;
-- resource_assignments
ALTER TABLE resource_assignments RENAME COLUMN "bookingId" TO booking_id;
ALTER TABLE resource_assignments RENAME COLUMN "resourceId" TO resource_id;
ALTER TABLE resource_assignments RENAME COLUMN "startsAt" TO starts_at;
ALTER TABLE resource_assignments RENAME COLUMN "endsAt" TO ends_at;
ALTER TABLE resource_assignments RENAME COLUMN "assignedById" TO assigned_by_user_id;
ALTER TABLE resource_assignments RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE resource_assignments RENAME COLUMN "updatedAt" TO updated_at;
-- invoices
ALTER TABLE invoices RENAME COLUMN "projectId" TO project_id;
ALTER TABLE invoices RENAME COLUMN "invoiceNumber" TO invoice_number;
ALTER TABLE invoices RENAME COLUMN "taxTotal" TO tax_total;
ALTER TABLE invoices RENAME COLUMN "amountPaid" TO amount_paid;
ALTER TABLE invoices RENAME COLUMN "dueAt" TO due_at;
ALTER TABLE invoices RENAME COLUMN "issuedAt" TO issued_at;
ALTER TABLE invoices RENAME COLUMN "billingNameSnapshot" TO billing_name_snapshot;
ALTER TABLE invoices RENAME COLUMN "billingEmailSnapshot" TO billing_email_snapshot;
ALTER TABLE invoices RENAME COLUMN "voidedAt" TO voided_at;
ALTER TABLE invoices RENAME COLUMN "voidReason" TO void_reason;
ALTER TABLE invoices RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE invoices RENAME COLUMN "updatedAt" TO updated_at;
-- invoice_lines
ALTER TABLE invoice_lines RENAME COLUMN "invoiceId" TO invoice_id;
ALTER TABLE invoice_lines RENAME COLUMN "unitPrice" TO unit_price;
ALTER TABLE invoice_lines RENAME COLUMN "lineTotal" TO line_total;
ALTER TABLE invoice_lines RENAME COLUMN "sortOrder" TO sort_order;
ALTER TABLE invoice_lines RENAME COLUMN "createdAt" TO created_at;
-- payments
ALTER TABLE payments RENAME COLUMN "invoiceId" TO invoice_id;
ALTER TABLE payments RENAME COLUMN "projectId" TO project_id;
ALTER TABLE payments RENAME COLUMN "paymentMethod" TO payment_method;
ALTER TABLE payments RENAME COLUMN "receivedAt" TO received_at;
ALTER TABLE payments RENAME COLUMN "recordedByUserId" TO recorded_by_user_id;
ALTER TABLE payments RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE payments RENAME COLUMN "updatedAt" TO updated_at;
-- payment_transactions
ALTER TABLE payment_transactions RENAME COLUMN "paymentId" TO payment_id;
ALTER TABLE payment_transactions RENAME COLUMN "externalTransactionId" TO external_transaction_id;
ALTER TABLE payment_transactions RENAME COLUMN "processedAt" TO processed_at;
ALTER TABLE payment_transactions RENAME COLUMN "createdAt" TO created_at;
-- galleries
ALTER TABLE galleries RENAME COLUMN "projectId" TO project_id;
ALTER TABLE galleries RENAME COLUMN "accessToken" TO access_token;
ALTER TABLE galleries RENAME COLUMN "publishedAt" TO published_at;
ALTER TABLE galleries RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE galleries RENAME COLUMN "updatedAt" TO updated_at;
-- gallery_items
ALTER TABLE gallery_items RENAME COLUMN "galleryId" TO gallery_id;
ALTER TABLE gallery_items RENAME COLUMN "sortOrder" TO sort_order;
ALTER TABLE gallery_items RENAME COLUMN "createdAt" TO created_at;
-- audit_logs
ALTER TABLE audit_logs RENAME COLUMN "companyId" TO company_id;
ALTER TABLE audit_logs RENAME COLUMN "actorUserId" TO actor_user_id;
ALTER TABLE audit_logs RENAME COLUMN "entityType" TO entity_type;
ALTER TABLE audit_logs RENAME COLUMN "entityId" TO entity_id;
ALTER TABLE audit_logs RENAME COLUMN "beforeData" TO before_data;
ALTER TABLE audit_logs RENAME COLUMN "afterData" TO after_data;
ALTER TABLE audit_logs RENAME COLUMN "createdAt" TO created_at;
-- outbox_events
ALTER TABLE outbox_events RENAME COLUMN "eventType" TO event_type;
ALTER TABLE outbox_events RENAME COLUMN "aggregateType" TO aggregate_type;
ALTER TABLE outbox_events RENAME COLUMN "aggregateId" TO aggregate_id;
ALTER TABLE outbox_events RENAME COLUMN "correlationId" TO correlation_id;
ALTER TABLE outbox_events RENAME COLUMN "causationId" TO causation_id;
ALTER TABLE outbox_events RENAME COLUMN "attemptCount" TO attempt_count;
ALTER TABLE outbox_events RENAME COLUMN "availableAt" TO available_at;
ALTER TABLE outbox_events RENAME COLUMN "processedAt" TO processed_at;
ALTER TABLE outbox_events RENAME COLUMN "createdAt" TO created_at;

