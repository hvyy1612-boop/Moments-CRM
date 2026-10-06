import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { createInvoiceTx, issueCreditNoteTx } from '@/lib/domain/finance'
import type { CreateInvoiceInput } from '@/lib/validation/finance'

/** Test fixture: a single-line invoice (the app issues these for change-request fees). */
export function createInvoice(projectId: string, input: CreateInvoiceInput, actorUserId: string | null) {
  return prisma.$transaction((tx) => createInvoiceTx(tx, projectId, input, actorUserId))
}

/** Test fixture: a credit note against an invoice (the app issues these for price-decrease changes). */
export function issueCreditNote(invoiceId: string, amount: Prisma.Decimal | string | number, reason: string | null, actorUserId: string | null) {
  return prisma.$transaction((tx) => issueCreditNoteTx(tx, invoiceId, amount, reason, actorUserId))
}
