import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { splitGstInclusive } from '@/lib/money'
import { sydneyLocalToUtc, systemClock } from '@/lib/time'
import type { CreateInvoiceInput, CreateInvoiceLinesInput, RecordPaymentInput } from '@/lib/validation/finance'
import { invoicePaidNet, lockInvoiceRow, refreshInvoiceAmountPaid } from './invoice-ledger'
import { maybeAutoCompleteJob } from './project-workflow'

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

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
            description: input.discountReason?.trim() || '',
            quantity: 1,
            unitPrice: discount.negated(),
            discount: new Prisma.Decimal(0),
            tax: new Prisma.Decimal(0),
            lineTotal: discount.negated(),
            sortOrder: lineData.length,
          })
        }

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
            dueAt: instalmentData.reduce<Date | null>((m, it) => (it.dueAt && (!m || it.dueAt > m) ? it.dueAt : m), null),
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

export async function updateInvoiceWithLines(
  invoiceId: string,
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
  const wantedNumber = input.invoiceNumber?.trim()

  return prisma.$transaction(async (tx) => {
    const existing = await tx.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, status: true, amountPaid: true, invoiceNumber: true },
    })
    if (!existing) throw new Error('Invoice not found.')
    if (existing.amountPaid.gt(0) || existing.status === 'PAID' || existing.status === 'PARTIALLY_PAID' || existing.status === 'VOID') {
      throw new Error('This invoice has payments or is closed. It can no longer be edited.')
    }
    if (wantedNumber && wantedNumber !== existing.invoiceNumber) {
      const clash = await tx.invoice.findFirst({ where: { invoiceNumber: wantedNumber, id: { not: invoiceId } }, select: { id: true } })
      if (clash) throw new Error('That invoice number is already in use.')
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
        description: input.discountReason?.trim() || '',
        quantity: 1,
        unitPrice: discount.negated(),
        discount: new Prisma.Decimal(0),
        tax: new Prisma.Decimal(0),
        lineTotal: discount.negated(),
        sortOrder: lineData.length,
      })
    }

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

    await tx.invoiceLine.deleteMany({ where: { invoiceId } })
    await tx.invoiceInstalment.deleteMany({ where: { invoiceId } })
    const invoice = await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        invoiceNumber: wantedNumber || existing.invoiceNumber,
        type: input.type,
        subtotal,
        taxTotal,
        total,
        invoiceDate: input.invoiceDate ? sydneyLocalToUtc(`${input.invoiceDate}T00:00`) : now,
        dueAt: instalmentData.reduce<Date | null>((m, it) => (it.dueAt && (!m || it.dueAt > m) ? it.dueAt : m), null),
        poNumber: input.poNumber?.trim() || null,
        notes: input.notes?.trim() || null,
        lines: { create: lineData },
        instalments: { create: instalmentData },
      },
    })
    await tx.auditLog.create({
      data: {
        action: 'invoice.updated',
        entityType: 'Invoice',
        entityId: invoiceId,
        actorUserId,
        afterData: { total: total.toString(), lines: input.lines.length },
      },
    })
    return invoice
  })
}

export async function voidInvoice(invoiceId: string, actorUserId: string | null) {
  return prisma.$transaction(async (tx) => {
    await lockInvoiceRow(tx, invoiceId)
    const inv = await tx.invoice.findUnique({ where: { id: invoiceId }, select: { id: true, status: true } })
    if (!inv) throw new Error('Invoice not found.')

    const paidNet = await invoicePaidNet(tx, invoiceId)
    if (paidNet.greaterThan(0)) throw new Error('This invoice has payments recorded. Refund it instead of voiding.')
    if (inv.status === 'VOID') return inv
    await tx.invoice.update({ where: { id: invoiceId }, data: { status: 'VOID' } })
    await tx.auditLog.create({ data: { action: 'invoice.voided', entityType: 'Invoice', entityId: invoiceId, actorUserId } })
    return inv
  })
}

export async function issueCreditNote(
  invoiceId: string,
  amount: Prisma.Decimal | string | number,
  reason: string | null,
  actorUserId: string | null,
) {
  const value = new Prisma.Decimal(amount)
  if (value.lessThanOrEqualTo(0)) throw new Error('Credit note amount must be greater than zero.')
  return prisma.$transaction(async (tx) => {
    await lockInvoiceRow(tx, invoiceId)
    const invoice = await tx.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, projectId: true, total: true, status: true },
    })
    if (!invoice) throw new Error('Invoice not found.')
    if (invoice.status === 'DRAFT' || invoice.status === 'VOID') {
      throw new Error('Only an issued invoice can be credited.')
    }
    const priorCredits = await tx.creditNote.findMany({
      where: { invoiceId, NOT: { status: 'VOIDED' } },
      select: { amount: true },
    })
    const creditedTotal = priorCredits.reduce((s, c) => s.add(c.amount), new Prisma.Decimal(0))
    if (creditedTotal.add(value).greaterThan(invoice.total)) {
      throw new Error('Credit notes cannot exceed the invoice total.')
    }
    const creditNote = await tx.creditNote.create({
      data: { invoiceId, amount: value, reason: reason ?? null, status: 'SUCCEEDED', issuedByUserId: actorUserId },
    })

    const paidNet = await invoicePaidNet(tx, invoiceId)
    const obligation = invoice.total.sub(creditedTotal.add(value))
    const status = paidNet.greaterThanOrEqualTo(obligation)
      ? 'PAID'
      : paidNet.greaterThan(0)
        ? 'PARTIALLY_PAID'
        : invoice.status
    await tx.invoice.update({ where: { id: invoiceId }, data: { status } })

    const project = await tx.project.findUnique({ where: { id: invoice.projectId }, select: { companyId: true } })
    await tx.auditLog.create({
      data: {
        companyId: project?.companyId ?? null,
        action: 'invoice.credit_note_issued',
        entityType: 'Invoice',
        entityId: invoiceId,
        actorUserId,
        afterData: { amount: value.toString(), reason: reason ?? null },
      },
    })
    return creditNote
  })
}

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

export async function recordPayment(
  invoiceId: string,
  input: RecordPaymentInput,
  actorUserId: string | null,
  opts: { idempotencyKey?: string | null } = {},
) {
  const now = systemClock.now()
  const amount = new Prisma.Decimal(input.amount)
  if (amount.lessThanOrEqualTo(0)) throw new Error('Enter an amount greater than zero.')
  const idempotencyKey = opts.idempotencyKey ?? null

  return prisma.$transaction(async (tx) => {

    await lockInvoiceRow(tx, invoiceId)
    const invoice = await tx.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, projectId: true, type: true, status: true, total: true },
    })
    if (!invoice) throw new Error('Invoice not found.')
    if (invoice.status === 'VOID') throw new Error('This invoice has been voided.')

    if (idempotencyKey) {
      const prior = await tx.paymentTransaction.findFirst({
        where: { provider: 'manual', externalTransactionId: idempotencyKey },
        select: { payment: { select: { id: true } } },
      })
      if (prior) {
        const already = await invoicePaidNet(tx, invoiceId)
        return { paidInFull: already.greaterThanOrEqualTo(invoice.total), idempotentReplay: true }
      }
    }

    const paidNet = await invoicePaidNet(tx, invoiceId)
    if (invoice.status === 'PAID' || paidNet.greaterThanOrEqualTo(invoice.total)) {
      throw new Error('This invoice is already paid in full.')
    }
    const remaining = invoice.total.sub(paidNet)
    if (amount.greaterThan(remaining)) {
      throw new Error(`That is more than the balance due (${remaining.toFixed(2)}).`)
    }

    let payment
    try {
      payment = await tx.payment.create({
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
              externalTransactionId: idempotencyKey,
              type: 'CHARGE',
              amount,
              status: 'SUCCEEDED',
              processedAt: now,
              metadata: input.reference ? { reference: input.reference } : undefined,
            },
          },
        },
      })
    } catch (err) {

      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002' && idempotencyKey) {
        const already = await invoicePaidNet(tx, invoiceId)
        return { paidInFull: already.greaterThanOrEqualTo(invoice.total), idempotentReplay: true }
      }
      throw err
    }

    const newAmountPaid = await refreshInvoiceAmountPaid(tx, invoiceId, invoice.total, invoice.status)
    const paidInFull = newAmountPaid.greaterThanOrEqualTo(invoice.total)

    if (paidInFull) {

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

      if (invoice.projectId) await maybeAutoCompleteJob(tx, invoice.projectId, actorUserId)
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

function invoiceToken(): string {
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function getInvoiceByToken(token: string) {
  if (!token || token.length < 16) return null
  return prisma.invoice.findUnique({
    where: { accessToken: token },
    select: {
      invoiceNumber: true, type: true, status: true, total: true,
      amountPaid: true, invoiceDate: true, dueAt: true, poNumber: true, notes: true,
      billingNameSnapshot: true, billingEmailSnapshot: true,
      lines: { orderBy: { sortOrder: 'asc' }, select: { itemName: true, description: true, quantity: true, unitPrice: true, discount: true, lineTotal: true } },
      project: {
        select: {
          name: true, code: true,
          client: { select: { phone: true, street: true, suburb: true, state: true, postcode: true, country: true } },
          company: { select: { name: true, abn: true, settings: true } },
          bookings: { orderBy: { startsAt: 'asc' }, take: 1, select: { startsAt: true, endsAt: true, location: true, title: true } },
        },
      },
    },
  })
}

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

export async function markOverdueInvoices(now: Date = systemClock.now()) {
  const candidates = await prisma.invoice.findMany({
    where: { status: { in: ['ISSUED', 'SENT', 'PARTIALLY_PAID'] }, dueAt: { lt: now } },
    select: { id: true, total: true, amountPaid: true },
  })
  const ids = candidates.filter((i) => i.total.greaterThan(i.amountPaid)).map((i) => i.id)
  if (ids.length === 0) return { marked: 0 }
  const res = await prisma.invoice.updateMany({ where: { id: { in: ids } }, data: { status: 'OVERDUE' } })
  return { marked: res.count }
}
