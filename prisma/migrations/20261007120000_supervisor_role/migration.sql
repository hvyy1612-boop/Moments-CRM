-- Read-only SUPERVISOR role (sees the CRM, every write refused, no Activity / Settings / Users).
-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'SUPERVISOR';

