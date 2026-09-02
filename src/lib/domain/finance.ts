import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { splitGstInclusive } from '@/lib/money'
import { sydneyLocalToUtc, systemClock } from '@/lib/time'
import type { CreateInvoiceInput, CreateInvoiceLinesInput, RecordPaymentInput } from '@/lib/validation/finance'

/**
 * Finance. Invoices are raised against a confirmed project and paid down by payments. Each payment
 * writes an append-only PaymentTransaction, which is the financial source of truth; the invoice's
 * amountPaid is a cache recomputed from it (blueprint invariants 3 and 8). Amounts are GST inclusive.
 */

/** The interactive-transaction client type, carrying the db.ts extensions. */
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

/** Human invoice number, per year: INV-2026-0001. */
async function nextInvoiceNumber(tx: Tx, year: number): Promise<string> {
  const prefix = `INV-${year}-`
  const last = await tx.invoice.findFirst({
    where: { invoiceNumber: { startsWith: prefix } },
    orderBy: { invoiceNumber: 'desc' },
    select: { invoiceNumber: true },
  })
  const next = last ? Number(last.invoiceNumber.slice(prefix.length)) + 1 : 1
  return `${prefix}${String(next).padStart(4, '0')}`
}

/**
 * Raise a draft invoice for a confirmed project. The amount is GST inclusive and becomes a single
 * line. Retries on the rare invoice-number collision so concurrency never surfaces as a user error.
 */
export async function createInvoice(
  projectId: string,
  input: CreateInvoiceInput,
  actorUserId: string | null,
) {
  const now = systemClock.now()
  const total = new Prisma.Decimal(input.amount)
  if (total.lessThanOrEqualTo(0)) throw new Error('Enter an amount greater than zero.')
  const { subtotal, taxTotal } = splitGstInclusive(total)

  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const project = await tx.project.findUnique({
          where: { id: projectId },
          select: {
            id: true,
            lifecycleStatus: true,
            client: { select: { displayName: true, email: true } },
          },
        })
        if (!project) throw new Error('Project not found.')
        if (project.lifecycleStatus === 'CANCELLED' || project.lifecycleStatus === 'LOST') {
          throw new Error('This job is closed. Reopen it before invoicing.')
        }

        const invoice = await tx.invoice.create({
          data: {
            projectId,
            invoiceNumber: await nextInvoiceNumber(tx, now.getFullYear()),
            type: input.type,
            status: 'DRAFT',
            subtotal,
            taxTotal,
            total,
            billingNameSnapshot: project.client.displayName,
            billingEmailSnapshot: project.client.email,
            lines: {
              create: {
                description: input.description,
                quantity: 1,
                unitPrice: total,
                tax: taxTotal,
                lineTotal: total,
                sortOrder: 0,
              },
            },
          },
        })
        await tx.auditLog.create({
          data: {
            action: 'invoice.created',
            entityType: 'Invoice',
            entityId: invoice.id,
            actorUserId,
            afterData: { invoiceNumber: invoice.invoiceNumber, total: total.toString() },
          },
        })
        await tx.outboxEvent.create({
          data: {
            eventType: 'invoice.created',
            aggregateType: 'Invoice',
            aggregateId: invoice.id,
            payload: { invoiceId: invoice.id, projectId },
          },
        })
        return invoice
      })
    } catch (error) {
      const isUnique =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
      if (isUnique && attempt < 4) continue
      throw error
    }
  }
}

/**
 * Raise a draft invoice with multiple line items (packages and/or custom lines) and an optional
 * whole-invoice discount. Amounts are GST inclusive; a discount is stored as a negative line so the
 * lines always sum to the invoice total. Mirrors createInvoice's confirm check and number retry.
 */
export async function createInvoiceWithLines(
  projectId: string,
  input: CreateInvoiceLinesInput,
  actorUserId: string | null,
) {
  const now = systemClock.now()
  const lineNet = (l: { unitPrice: string; quantity: number; discount?: string }) => {
    const net = new Prisma.Decimal(l.unitPrice).times(l.quantity).minus(new Prisma.Decimal(l.discount || '0'))
    return net.lessThan(0) ? new Prisma.Decimal(0) : net
  }
  let gross = new Prisma.Decimal(0)
  for (const l of input.lines) gross = gross.plus(lineNet(l))
  const discount = input.discount ? new Prisma.Decimal(input.discount) : new Prisma.Decimal(0)
  if (discount.greaterThan(gross)) throw new Error('The discount cannot be more than the total.')
  const total = gross.minus(discount)
  if (total.lessThanOrEqualTo(0)) throw new Error('The invoice total must be greater than zero.')
  const { subtotal, taxTotal } = splitGstInclusive(total)
  const accessToken = invoiceToken()

  const wantedNumber = input.invoiceNumber?.trim()
  if (wantedNumber) {
    const clash = await prisma.invoice.findFirst({ where: { invoiceNumber: wantedNumber }, select: { id: true } })
    if (clash) throw new Error('That invoice number is already in use.')
  }

  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const project = await tx.project.findUnique({
          where: { id: projectId },
          select: { id: true, lifecycleStatus: true, client: { select: { displayName: true, email: true } } },
        })
        if (!project) throw new Error('Project not found.')
        if (project.lifecycleStatus === 'CANCELLED' || project.lifecycleStatus === 'LOST') {
          throw new Error('This job is closed. Reopen it before invoicing.')
        }

        const lineData = input.lines.map((l, i) => ({
          itemName: l.itemName?.trim() || null,
          description: l.description?.trim() || '',
          quantity: l.quantity,
          unitPrice: new Prisma.Decimal(l.unitPrice),
          discount: new Prisma.Decimal(l.discount || '0'),
          tax: new Prisma.Decimal(0),
          lineTotal: lineNet(l),
          sortOrder: i,
        }))
        if (discount.greaterThan(0)) {
          lineData.push({
            itemName: 'Discount',
            description: '',
            quantity: 1,
            unitPrice: discount.negated(),
            discount: new Prisma.Decimal(0),
            tax: new Prisma.Decimal(0),
            lineTotal: discount.negated(),
            sortOrder: lineData.length,
          })
        }

        // Payment schedule: use the given instalments (must sum to the total) or a single full one.
        let instalmentData
        if (input.instalments && input.instalments.length > 0) {
          let sum = new Prisma.Decimal(0)
          for (const it of input.instalments) sum = sum.plus(new Prisma.Decimal(it.amount))
          if (!sum.equals(total)) throw new Error('The payment schedule must add up to the invoice total.')
          instalmentData = input.instalments.map((it, i) => ({
            label: it.label?.trim() || null,
            dueAt: it.dueAt ? sydneyLocalToUtc(`${it.dueAt}T00:00`) : null,
            amount: new Prisma.Decimal(it.amount),
            status: 'UNPAID',
            sortOrder: i,
          }))
        } else {
          instalmentData = [{ label: 'Full payment', dueAt: null, amount: total, status: 'UNPAID', sortOrder: 0 }]
        }

        const invoice = await tx.invoice.create({
          data: {
            projectId,
            invoiceNumber: wantedNumber || (await nextInvoiceNumber(tx, now.getFullYear())),
            accessToken,
            type: input.type,
            status: 'DRAFT',
            subtotal,
            taxTotal,
            total,
            invoiceDate: input.invoiceDate ? sydneyLocalToUtc(`${input.invoiceDate}T00:00`) : now,
            poNumber: input.poNumber?.trim() || null,
            notes: input.notes?.trim() || null,
            billingNameSnapshot: project.client.displayName,
            billingEmailSnapshot: project.client.email,
            lines: { create: lineData },
            instalments: { create: instalmentData },
          },
        })
        await tx.auditLog.create({
          data: {
            action: 'invoice.created',
            entityType: 'Invoice',
            entityId: invoice.id,
            actorUserId,
            afterData: { invoiceNumber: invoice.invoiceNumber, total: total.toString(), lines: input.lines.length },
          },
        })
        await tx.outboxEvent.create({
          data: { eventType: 'invoice.created', aggregateType: 'Invoice', aggregateId: invoice.id, payload: { invoiceId: invoice.id, projectId } },
        })
        return invoice
      })
    } catch (error) {
      const isUnique = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
      if (isUnique && attempt < 4) continue
      throw error
    }
  }
}

/** Issue a draft invoice to the client. */
export async function issueInvoice(invoiceId: string, actorUserId: string | null) {
  const now = systemClock.now()
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, status: true },
    })
    if (!invoice) throw new Error('Invoice not found.')
    if (invoice.status !== 'DRAFT') throw new Error('This invoice has already been issued.')

    await tx.invoice.update({
      where: { id: invoiceId },
      data: { status: 'ISSUED', issuedAt: now },
    })
    await tx.auditLog.create({
      data: { action: 'invoice.issued', entityType: 'Invoice', entityId: invoiceId, actorUserId },
    })
    await tx.outboxEvent.create({
      data: {
        eventType: 'invoice.issued',
        aggregateType: 'Invoice',
        aggregateId: invoiceId,
        payload: { invoiceId },
      },
    })
    return { status: 'ISSUED' as const }
  })
}

/**
 * Delete an invoice (lines and instalments cascade). Refused once any money has been recorded
 * against it - a paid or part-paid invoice must be refunded/voided, not deleted, so the financial
 * ledger stays intact (blueprint invariant 3).
 */
export async function deleteInvoice(invoiceId: string, actorUserId: string | null) {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, status: true, amountPaid: true, invoiceNumber: true },
    })
    if (!invoice) throw new Error('Invoice not found.')
    if (invoice.amountPaid.gt(0) || invoice.status === 'PAID' || invoice.status === 'PARTIALLY_PAID') {
      throw new Error('This invoice has payments recorded. Void or refund it instead of deleting.')
    }
    await tx.invoice.delete({ where: { id: invoiceId } })
    await tx.auditLog.create({
      data: {
        action: 'invoice.deleted',
        entityType: 'Invoice',
        entityId: invoiceId,
        actorUserId,
        metadata: { invoiceNumber: invoice.invoiceNumber } as Prisma.InputJsonValue,
      },
    })
    return { deleted: true as const }
  })
}

/**
 * Record a manual payment against an invoice. Writes a Payment plus its append-only charge
 * transaction, refreshes the invoice's cached amountPaid and status, and advances the project's
 * commercial status when the invoice is fully paid.
 */
export async function recordPayment(
  invoiceId: string,
  input: RecordPaymentInput,
  actorUserId: string | null,
) {
  const now = systemClock.now()
  const amount = new Prisma.Decimal(input.amount)
  if (amount.lessThanOrEqualTo(0)) throw new Error('Enter an amount greater than zero.')

  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        projectId: true,
        type: true,
        status: true,
        total: true,
        amountPaid: true,
      },
    })
    if (!invoice) throw new Error('Invoice not found.')
    if (invoice.status === 'VOID') throw new Error('This invoice has been voided.')
    if (invoice.status === 'PAID') throw new Error('This invoice is already paid in full.')

    const remaining = invoice.total.sub(invoice.amountPaid)
    if (amount.greaterThan(remaining)) {
      throw new Error(`That is more than the balance due (${remaining.toFixed(2)}).`)
    }

    const payment = await tx.payment.create({
      data: {
        invoiceId,
        projectId: invoice.projectId,
        status: 'PAID',
        amount,
        paymentMethod: input.paymentMethod,
        receivedAt: now,
        recordedByUserId: actorUserId,
        transactions: {
          create: {
            provider: 'manual',
            type: 'CHARGE',
            amount,
            status: 'SUCCEEDED',
            processedAt: now,
            metadata: input.reference ? { reference: input.reference } : undefined,
          },
        },
      },
    })

    const newAmountPaid = invoice.amountPaid.add(amount)
    const paidInFull = newAmountPaid.greaterThanOrEqualTo(invoice.total)
    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        amountPaid: newAmountPaid,
        status: paidInFull ? 'PAID' : 'PARTIALLY_PAID',
      },
    })

    if (paidInFull) {
      // Advance the project's commercial status, never downgrade it.
      const next = invoice.type === 'DEPOSIT' ? 'DEPOSIT_PAID' : 'PAID'
      const project = await tx.project.findUnique({
        where: { id: invoice.projectId },
        select: { commercialStatus: true },
      })
      if (!(next === 'DEPOSIT_PAID' && project?.commercialStatus === 'PAID')) {
        await tx.project.update({
          where: { id: invoice.projectId },
          data: { commercialStatus: next },
        })
      }
    }

    await tx.auditLog.create({
      data: {
        action: 'payment.recorded',
        entityType: 'Payment',
        entityId: payment.id,
        actorUserId,
        afterData: { invoiceId, amount: amount.toString() },
      },
    })
    await tx.outboxEvent.create({
      data: {
        eventType: 'payment.recorded',
        aggregateType: 'Payment',
        aggregateId: payment.id,
        payload: { paymentId: payment.id, invoiceId, projectId: invoice.projectId },
      },
    })

    return { paidInFull }
  })
}

/** Unguessable token for the client-facing invoice link (32 hex chars). */
function invoiceToken(): string {
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Full invoice for the client portal (by access token), or null. No session required. */
export async function getInvoiceByToken(token: string) {
  if (!token || token.length < 16) return null
  return prisma.invoice.findUnique({
    where: { accessToken: token },
    select: {
      invoiceNumber: true, type: true, status: true, subtotal: true, taxTotal: true, total: true,
      amountPaid: true, invoiceDate: true, poNumber: true, notes: true,
      billingNameSnapshot: true, billingEmailSnapshot: true,
      lines: { orderBy: { sortOrder: 'asc' }, select: { itemName: true, description: true, quantity: true, unitPrice: true, discount: true, lineTotal: true } },
      instalments: { orderBy: { sortOrder: 'asc' }, select: { label: true, dueAt: true, amount: true, status: true } },
      project: {
        select: {
          client: { select: { displayName: true, email: true, phone: true, street: true, suburb: true, state: true, postcode: true, country: true } },
          company: { select: { name: true, abn: true } },
        },
      },
    },
  })
}

/** Save the given line items as a reusable invoice template. */
export async function saveInvoiceTemplate(name: string, lines: { itemName?: string; description: string; quantity: number; unitPrice: string }[]) {
  const company = await prisma.company.findFirst({ select: { id: true } })
  if (!company) throw new Error('No company configured.')
  if (!name.trim()) throw new Error('Give the template a name.')
  if (lines.length === 0) throw new Error('Add at least one item before saving a template.')
  await prisma.invoiceTemplate.create({
    data: { companyId: company.id, name: name.trim().slice(0, 150), linesJson: JSON.stringify(lines) },
  })
}

export type InvoiceTemplateOption = { id: string; name: string; lines: { itemName?: string; description: string; quantity: number; unitPrice: string }[] }

/** List saved invoice templates for the studio. */
export async function listInvoiceTemplates(): Promise<InvoiceTemplateOption[]> {
  const rows = await prisma.invoiceTemplate.findMany({ orderBy: { createdAt: 'desc' }, select: { id: true, name: true, linesJson: true } })
  return rows.map((r) => {
    let lines: InvoiceTemplateOption['lines'] = []
    try {
      const parsed = JSON.parse(r.linesJson)
      if (Array.isArray(parsed)) lines = parsed
    } catch { /* ignore malformed template */ }
    return { id: r.id, name: r.name, lines }
  })
}
