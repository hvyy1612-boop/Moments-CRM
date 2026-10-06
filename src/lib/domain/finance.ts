import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { splitGstInclusive } from '@/lib/money'
import { sydneyLocalToUtc, sydneyYmd, systemClock } from '@/lib/time'
import { JOB_SHOOT_SELECT } from './deadline'
import { sendComposedInvoiceEmail, type SendResult } from '@/lib/email'
import type { CreateInvoiceInput, CreateInvoiceLinesInput, RecordPaymentInput } from '@/lib/validation/finance'
import { invoiceObligation, invoicePaidNet, lockInvoiceRow, refreshInvoiceAmountPaid } from './invoice-ledger'
import { confirmBookingByDepositTx, maybeAutoCompleteJob } from './project-workflow'
import { nextRecordNumber } from './numbering'
import { INVOICE_MONEY_SELECT, toInvoiceMoneyInput } from './invoice-money'
import { getInvoiceBalance, nextPaymentDue } from './money'

/**
 * Finance. Invoices are raised against a confirmed project and paid down by payments. Each payment
 * writes an append-only PaymentTransaction, which is the financial source of truth; the invoice's
 * amountPaid is a cache recomputed from it (blueprint invariants 3 and 8). Amounts are GST inclusive.
 */

/** The interactive-transaction client type, carrying the db.ts extensions. */
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

/** Human invoice number, I<YYYY><4d> (e.g. I20260001), from the shared per-company/year counter. */
/** A YYYY-MM-DD Sydney calendar date for an instant. */
function sydneyYmdString(at: Date): string {
  const { year, month, day } = sydneyYmd(at)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * The form's "Due" rule (On issue / 7 / 14 days) as the start of that Sydney calendar day. Counted in
 * calendar days, not 24h blocks, so a daylight-saving change never lands it on the previous evening.
 */
function dueFromRuleOf(due: CreateInvoiceLinesInput['due'], invoiceDate: string | undefined, docDate: Date): Date | null {
  const days = due === 'NET7' ? 7 : due === 'NET14' ? 14 : due === 'ON_ISSUE' ? 0 : null
  if (days === null) return null
  const base = new Date(`${invoiceDate || sydneyYmdString(docDate)}T00:00:00Z`)
  base.setUTCDate(base.getUTCDate() + days)
  return sydneyLocalToUtc(`${base.toISOString().slice(0, 10)}T00:00`)
}

/**
 * The next free invoice number. Staff may type an invoice number by hand, which never advances the
 * counter, so the counter can later land on a number that is already taken. Skip past any such number
 * instead of colliding: a collision would roll the counter back with the failed insert and every retry -
 * and every later invoice - would hit the same number again.
 */
async function nextInvoiceNumber(tx: Tx, companyId: string, at: Date = systemClock.now()): Promise<string> {
  for (let guard = 0; guard < 1000; guard++) {
    const candidate = await nextRecordNumber(tx, companyId, 'INVOICE', at)
    const taken = await tx.invoice.findFirst({ where: { invoiceNumber: candidate }, select: { id: true } })
    if (!taken) return candidate
  }
  throw new Error('Could not find a free invoice number. Please try again.')
}

/**
 * One single-line invoice (GST inclusive amount) + audit + outbox, inside the caller's transaction, so a
 * Change Request can issue its fee invoice together with the change in ONE transaction (docs/25 Rule
 * C5). An invoice-number collision (P2002) aborts the caller's transaction, which retries.
 */
export async function createInvoiceTx(
  tx: Tx,
  projectId: string,
  input: CreateInvoiceInput,
  actorUserId: string | null,
) {
  const now = systemClock.now()
  const total = new Prisma.Decimal(input.amount)
  if (total.lessThanOrEqualTo(0)) throw new Error('Enter an amount greater than zero.')
  const { subtotal, taxTotal } = splitGstInclusive(total)

  const project = await tx.project.findUnique({
    where: { id: projectId },
    select: { id: true, companyId: true, lifecycleStatus: true, client: { select: { displayName: true, email: true } } },
  })
  if (!project) throw new Error('Project not found.')
  if (project.lifecycleStatus === 'CANCELLED') {
    throw new Error('This job is closed. Reopen it before invoicing.')
  }

  const invoice = await tx.invoice.create({
    data: {
      projectId,
      invoiceNumber: await nextInvoiceNumber(tx, project.companyId, now),
      type: input.type,
      // Invoices are official the moment they are created - there is no draft stage (removed per owner
      // decision). issuedAt is stamped now so due dates and financial reporting start immediately.
      status: 'ISSUED',
      issuedAt: now,
      subtotal,
      taxTotal,
      total,
      billingNameSnapshot: project.client.displayName,
      billingEmailSnapshot: project.client.email,
      lines: {
        // The single label is the item NAME (itemName is what the line table + validation key on);
        // leave description empty so a deposit/balance line is valid and never reads as "Untitled item".
        create: { itemName: input.description, description: '', quantity: 1, unitPrice: total, tax: taxTotal, lineTotal: total, sortOrder: 0 },
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
          select: { id: true, companyId: true, lifecycleStatus: true, client: { select: { displayName: true, email: true } } },
        })
        if (!project) throw new Error('Project not found.')
        if (project.lifecycleStatus === 'CANCELLED') {
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

        // Document date + the form's due rule (On issue / 7 / 14 days).
        const docDate = input.invoiceDate ? sydneyLocalToUtc(`${input.invoiceDate}T00:00`) : now
        const dueFromRule = dueFromRuleOf(input.due, input.invoiceDate || undefined, docDate)

        // Payment schedule: use the given instalments (must sum to the total) or a single full one. The single
        // payment carries the due date too, so reminders and overdue follow-ups work without a split.
        let instalmentData
        if (input.instalments && input.instalments.length > 0) {
          let sum = new Prisma.Decimal(0)
          for (const it of input.instalments) sum = sum.plus(new Prisma.Decimal(it.amount))
          if (!sum.equals(total)) throw new Error('The payment schedule must add up to the invoice total.')
          instalmentData = input.instalments.map((it, i) => ({
            label: it.label?.trim() || null,
            dueAt: it.dueAt ? sydneyLocalToUtc(`${it.dueAt}T00:00`) : null,
            amount: new Prisma.Decimal(it.amount),
            sortOrder: i,
          }))
        } else {
          instalmentData = [{ label: 'Full payment', dueAt: dueFromRule, amount: total, sortOrder: 0 }]
        }

        // A multi-instalment schedule is due at its latest instalment; otherwise the form's rule applies.
        const dueFromInstalments = instalmentData.reduce<Date | null>((m, it) => (it.dueAt && (!m || it.dueAt > m) ? it.dueAt : m), null)

        const invoice = await tx.invoice.create({
          data: {
            projectId,
            invoiceNumber: wantedNumber || (await nextInvoiceNumber(tx, project.companyId, now)),
            accessToken,
            type: input.type,
            // Official on creation - no draft stage (removed per owner decision); stamp issuedAt now.
            status: 'ISSUED',
            issuedAt: now,
            subtotal,
            taxTotal,
            total,
            invoiceDate: docDate,
            dueAt: dueFromInstalments ?? dueFromRule,
            poNumber: input.poNumber?.trim() || null,
            notes: input.notes?.trim() || null,
            // Editable per-invoice snapshots (New invoice form); fall back to the client/project.
            billingNameSnapshot: input.billingName?.trim() || project.client.displayName,
            billingEmailSnapshot: input.billingEmail?.trim() || project.client.email,
            billingPhoneSnapshot: input.billingPhone?.trim() || null,
            billingJobNameSnapshot: input.jobName?.trim() || null,
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

/**
 * Edit an existing invoice: replace its lines, payment schedule and header fields. Allowed only while
 * nothing has been paid (a paid/void invoice is locked - void or refund it instead), so the ledger
 * stays intact. Lines and instalments are rebuilt from the input, matching createInvoiceWithLines.
 */
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
    // Serialise with payments/refunds on this invoice (F-1) and check the LEDGER, not the cache, so a payment
    // committing at the same moment can never be followed by a total edited below what was paid.
    await lockInvoiceRow(tx, invoiceId)
    const existing = await tx.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, status: true, amountPaid: true, invoiceNumber: true },
    })
    if (!existing) throw new Error('Invoice not found.')
    const paidOnLedger = await invoicePaidNet(tx, invoiceId)
    if (paidOnLedger.gt(0) || existing.amountPaid.gt(0) || existing.status === 'PAID' || existing.status === 'PARTIALLY_PAID' || existing.status === 'VOID') {
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

    const docDate = input.invoiceDate ? sydneyLocalToUtc(`${input.invoiceDate}T00:00`) : now
    const dueFromRule = dueFromRuleOf(input.due, input.invoiceDate || undefined, docDate)

    let instalmentData
    if (input.instalments && input.instalments.length > 0) {
      let sum = new Prisma.Decimal(0)
      for (const it of input.instalments) sum = sum.plus(new Prisma.Decimal(it.amount))
      if (!sum.equals(total)) throw new Error('The payment schedule must add up to the invoice total.')
      instalmentData = input.instalments.map((it, i) => ({
        label: it.label?.trim() || null,
        dueAt: it.dueAt ? sydneyLocalToUtc(`${it.dueAt}T00:00`) : null,
        amount: new Prisma.Decimal(it.amount),
        sortOrder: i,
      }))
    } else {
      instalmentData = [{ label: 'Full payment', dueAt: dueFromRule, amount: total, sortOrder: 0 }]
    }

    await tx.invoiceLine.deleteMany({ where: { invoiceId } })
    await tx.invoiceInstalment.deleteMany({ where: { invoiceId } })
    // Same due rule as create: a split schedule is due at its latest instalment, otherwise the form's
    // "Due" choice (On issue / 7 / 14 days) relative to the document date; no choice keeps the old rule.
    const dueFromInstalments = instalmentData.reduce<Date | null>((m, it) => (it.dueAt && (!m || it.dueAt > m) ? it.dueAt : m), null)
    const invoice = await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        invoiceNumber: wantedNumber || existing.invoiceNumber,
        type: input.type,
        subtotal,
        taxTotal,
        total,
        invoiceDate: docDate,
        dueAt: dueFromInstalments ?? dueFromRule,
        poNumber: input.poNumber?.trim() || null,
        notes: input.notes?.trim() || null,
        // Editing from the full invoice form also edits this invoice's billing snapshot (never the master
        // Client). Callers that don't send these fields leave the snapshot as it was.
        ...(input.billingName?.trim() ? { billingNameSnapshot: input.billingName.trim() } : {}),
        ...(input.billingEmail?.trim() ? { billingEmailSnapshot: input.billingEmail.trim() } : {}),
        ...(input.billingPhone !== undefined ? { billingPhoneSnapshot: input.billingPhone.trim() || null } : {}),
        ...(input.jobName !== undefined ? { billingJobNameSnapshot: input.jobName.trim() || null } : {}),
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
        afterData: { total: total.toString(), lines: input.lines.length, instalments: instalmentData.length },
      },
    })
    return invoice
  })
}

/** Void an invoice (status VOID). Refused once any money is recorded - refund it instead. */
export async function voidInvoice(invoiceId: string, actorUserId: string | null) {
  return prisma.$transaction(async (tx) => {
    await lockInvoiceRow(tx, invoiceId) // F-1: serialise with concurrent payments/refunds
    const inv = await tx.invoice.findUnique({ where: { id: invoiceId }, select: { id: true, status: true } })
    if (!inv) throw new Error('Invoice not found.')
    // Check the LEDGER, not the cache: a payment that committed just before us must block the void.
    const paidNet = await invoicePaidNet(tx, invoiceId)
    if (paidNet.greaterThan(0)) throw new Error('This invoice has payments recorded. Refund it instead of voiding.')
    if (inv.status === 'VOID') return inv
    await tx.invoice.update({ where: { id: invoiceId }, data: { status: 'VOID' } })
    await tx.auditLog.create({ data: { action: 'invoice.voided', entityType: 'Invoice', entityId: invoiceId, actorUserId } })
    return inv
  })
}

/**
 * Issue a credit note against an invoice (docs/25 Rule M2/M8) — reduces its OBLIGATION, never touching
 * the payment ledger (that is what refunds are for). Locks the invoice row, refuses to credit more than
 * the invoice total, and re-derives the status against the reduced obligation. NOTE: the credit-notes
 * table is not read by the always-on writers (recordPayment/refund) so shipping this cannot break
 * payment recording on a database that has not yet run the credit_notes migration.
 */
/**
 * Transaction-aware core of {@link issueCreditNote}. Callers pass their own transaction so a Change
 * Request can issue a credit note (a price decrease) as part of its single apply transaction (docs/25
 * Rule C5).
 */
export async function issueCreditNoteTx(
  tx: Tx,
  invoiceId: string,
  amount: Prisma.Decimal | string | number,
  reason: string | null,
  actorUserId: string | null,
) {
  const value = new Prisma.Decimal(amount)
  if (value.lessThanOrEqualTo(0)) throw new Error('Credit note amount must be greater than zero.')
  await lockInvoiceRow(tx, invoiceId)
  const invoice = await tx.invoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, projectId: true, total: true, status: true },
  })
  if (!invoice) throw new Error('Invoice not found.')
  if (invoice.status === 'VOID') throw new Error('An uncollectible invoice cannot be credited.')
  const priorCredits = await tx.creditNote.findMany({
    where: { invoiceId },
    select: { amount: true },
  })
  const creditedTotal = priorCredits.reduce((s, c) => s.add(c.amount), new Prisma.Decimal(0))
  if (creditedTotal.add(value).greaterThan(invoice.total)) {
    throw new Error('Credit notes cannot exceed the invoice total.')
  }
  const creditNote = await tx.creditNote.create({
    data: { invoiceId, amount: value, reason: reason ?? null, issuedByUserId: actorUserId },
  })

  // Re-derive status against the reduced obligation (paid ≥ obligation ⇒ settled). Never touches the
  // payment ledger / amountPaid; owed is always computed obligation-aware by the Money foundation.
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
}

/**
 * "Send invoice": email the client their private invoice link. Only a delivery the email provider
 * ACCEPTED marks the invoice Sent and logs `invoice.sent`; with no provider configured, or a failed send,
 * it stays issued and the outcome says so - never a fake "sent" (Rule N9).
 */
export async function sendInvoice(
  invoiceId: string,
  email: { to: string; subject: string; body: string; baseUrl: string },
  actorUserId: string | null,
): Promise<{ outcome: SendResult['outcome'] }> {
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { status: true, accessToken: true } })
  if (!inv) throw new Error('Invoice not found.')
  if (inv.status === 'VOID') throw new Error('This invoice is void, so it cannot be sent.')
  let token = inv.accessToken
  if (!token) {
    token = invoiceToken()
    await prisma.invoice.update({ where: { id: invoiceId }, data: { accessToken: token } })
  }

  const now = systemClock.now()
  const result = await sendComposedInvoiceEmail({
    to: email.to,
    subject: email.subject,
    body: email.body,
    invoiceLink: `${email.baseUrl}/invoice/${token}`,
    idempotencyKey: `invoice-send-${invoiceId}-${now.getTime()}`,
  })
  if (result.outcome === 'ACCEPTED') {
    await prisma.$transaction(async (tx) => {
      // Issued -> Sent. A part-paid / overdue / paid invoice keeps its money status on a resend.
      await tx.invoice.updateMany({ where: { id: invoiceId, status: 'ISSUED' }, data: { status: 'SENT' } })
      await tx.auditLog.create({
        data: { action: 'invoice.sent', entityType: 'Invoice', entityId: invoiceId, actorUserId, afterData: { to: email.to } },
      })
    })
  }
  return { outcome: result.outcome }
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
    // A payment that was later refunded in full still belongs to the money ledger (and the database refuses
    // to delete an invoice with payment rows), so such an invoice is marked uncollectible instead.
    if ((await tx.payment.count({ where: { invoiceId } })) > 0) {
      throw new Error('This invoice has payment history, so it cannot be deleted. Mark it uncollectible instead.')
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
  opts: { idempotencyKey?: string | null } = {},
) {
  const now = systemClock.now()
  const amount = new Prisma.Decimal(input.amount)
  if (amount.lessThanOrEqualTo(0)) throw new Error('Enter an amount greater than zero.')
  const idempotencyKey = opts.idempotencyKey ?? null

  return prisma.$transaction(async (tx) => {
    // F-1: serialise money writers on this invoice, then validate against the LEDGER (not the cache).
    await lockInvoiceRow(tx, invoiceId)
    const invoice = await tx.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, projectId: true, type: true, status: true, total: true },
    })
    if (!invoice) throw new Error('Invoice not found.')
    if (invoice.status === 'VOID') throw new Error('This invoice has been voided.')

    // Idempotency (distinct from the row lock): a RETRY of the same request must not create a second
    // payment. The key is stored as the manual transaction's externalTransactionId (unique per provider).
    if (idempotencyKey) {
      const prior = await tx.paymentTransaction.findFirst({
        where: { provider: 'manual', externalTransactionId: idempotencyKey },
        select: { payment: { select: { id: true } } },
      })
      if (prior) {
        const already = await invoicePaidNet(tx, invoiceId)
        return { paidInFull: already.greaterThanOrEqualTo(await invoiceObligation(tx, invoiceId, invoice.total)), idempotentReplay: true }
      }
    }

    // What the client actually owes is the total less any credit notes (price reductions).
    const obligation = await invoiceObligation(tx, invoiceId, invoice.total)
    const paidNet = await invoicePaidNet(tx, invoiceId)
    if (invoice.status === 'PAID' || paidNet.greaterThanOrEqualTo(obligation)) {
      throw new Error('This invoice is already paid in full.')
    }
    const remaining = obligation.sub(paidNet)
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
              processedAt: now,
              metadata: input.reference ? { reference: input.reference } : undefined,
            },
          },
        },
      })
    } catch (err) {
      // Backstop: a concurrent request with the same idempotency key hit the unique constraint.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002' && idempotencyKey) {
        const already = await invoicePaidNet(tx, invoiceId)
        return { paidInFull: already.greaterThanOrEqualTo(obligation), idempotentReplay: true }
      }
      throw err
    }

    const newAmountPaid = await refreshInvoiceAmountPaid(tx, invoiceId, invoice.total, invoice.status)
    const paidInFull = newAmountPaid.greaterThanOrEqualTo(obligation)

    // Company policy (momentsphotography.com.au FAQ): the deposit secures the date. On a split DEPOSIT
    // invoice ("25% Deposit + 75% ...") paying the first instalment in full is that deposit, so it confirms
    // the booking without waiting for the final payment.
    // A cancelled job keeps its money history (e.g. a cancellation fee is still recorded), but a payment
    // never moves a cancelled job's status or its lead.
    const jobLive = invoice.projectId
      ? (await tx.project.findUnique({ where: { id: invoice.projectId }, select: { lifecycleStatus: true } }))?.lifecycleStatus !== 'CANCELLED'
      : false
    let depositCovered = false
    if (jobLive && !paidInFull && invoice.type === 'DEPOSIT') {
      const first = await tx.invoiceInstalment.findMany({ where: { invoiceId }, orderBy: { sortOrder: 'asc' }, take: 2, select: { amount: true } })
      depositCovered = first.length > 1 && newAmountPaid.greaterThanOrEqualTo(first[0]!.amount)
    }
    if (depositCovered && invoice.projectId) {
      const project = await tx.project.findUnique({ where: { id: invoice.projectId }, select: { commercialStatus: true } })
      if (project && !['PAID', 'DEPOSIT_PAID', 'CANCELLED'].includes(project.commercialStatus)) {
        await tx.project.update({ where: { id: invoice.projectId }, data: { commercialStatus: 'DEPOSIT_PAID' } })
      }
      await confirmBookingByDepositTx(tx, invoice.projectId, actorUserId)
    }

    if (paidInFull && jobLive) {
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
      // Neutral Enquiry model: the booking deposit is the confirmation gate. Paying a DEPOSIT (or paying
      // in full) confirms the booking - it activates the provisional Job and flips the linked enquiry to
      // BOOKING_CONFIRMED. Idempotent, so replaying the payment does nothing extra.
      if (invoice.projectId) await confirmBookingByDepositTx(tx, invoice.projectId, actorUserId)
      // Payment is one half of "done"; auto-complete the job if the checklist is finished too.
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

/** Unguessable token for the client-facing invoice link (32 hex chars). */
function invoiceToken(): string {
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Full invoice for the client portal (by access token), or null. No session required. */
export async function getInvoiceByToken(token: string) {
  if (!token || token.length < 16) return null
  const inv = await prisma.invoice.findUnique({
    where: { accessToken: token },
    select: {
      invoiceNumber: true, type: true, status: true, total: true,
      amountPaid: true, invoiceDate: true, dueAt: true, poNumber: true, notes: true,
      creditNotes: { select: { amount: true } },
      billingNameSnapshot: true, billingEmailSnapshot: true,
      lines: { orderBy: { sortOrder: 'asc' }, select: { itemName: true, description: true, quantity: true, unitPrice: true, discount: true, lineTotal: true } },
      project: {
        select: {
          name: true, code: true,
          client: { select: { phone: true, street: true, suburb: true, state: true, postcode: true, country: true } },
          company: { select: { name: true, abn: true, settings: true } },
          ...JOB_SHOOT_SELECT,
        },
      },
    },
  })
  if (!inv) return null
  // Fold credit notes into one credits total so the printable balance matches the ledger (bug #5).
  const creditsTotal = inv.creditNotes.reduce((s, c) => s.add(c.amount), new Prisma.Decimal(0))
  // This page is public (token link): hand the document ONLY the settings an invoice prints, never the
  // rest of Company Settings (e.g. the calendar subscription token).
  const all = (inv.project.company.settings ?? {}) as Record<string, unknown>
  const settings = Object.fromEntries(INVOICE_SETTINGS.filter((k) => k in all).map((k) => [k, all[k]])) as Prisma.JsonObject
  return { ...inv, project: { ...inv.project, company: { ...inv.project.company, settings } }, creditsTotal }
}

const INVOICE_SETTINGS = ['website', 'businessAddress', 'businessEmail', 'businessPhone', 'paymentInstructions', 'accountName', 'bsb', 'accountNumber', 'payId'] as const


/**
 * Mark outstanding invoices OVERDUE once their due date (the last scheduled payment) has passed and
 * they are not fully paid. Called by the daily cron. Recording a payment later flips the status back
 * to PARTIALLY_PAID/PAID, and the next run re-marks anything still overdue.
 */
export async function markOverdueInvoices(now: Date = systemClock.now()) {
  // Overdue only once the whole due DAY (Sydney) has passed: due dates are stored as the start of that day,
  // so comparing with "now" would flag an invoice on the very morning it falls due.
  const startOfTodaySydney = sydneyLocalToUtc(`${sydneyYmdString(now)}T00:00`)
  // A split invoice is overdue as soon as ANY instalment's day has passed unpaid (a late deposit), not only
  // once its final payment (the invoice's own due date) is late.
  const candidates = await prisma.invoice.findMany({
    where: {
      status: { in: ['ISSUED', 'SENT', 'PARTIALLY_PAID'] },
      OR: [{ dueAt: { lt: startOfTodaySydney } }, { instalments: { some: { dueAt: { lt: startOfTodaySydney } } } }],
    },
    select: { id: true, ...INVOICE_MONEY_SELECT },
  })
  // Credit-aware and allocation-aware: the earliest instalment still owed is the one that decides.
  const ids = candidates
    .filter((i) => {
      const next = nextPaymentDue(getInvoiceBalance(toInvoiceMoneyInput(i)))
      return next != null && next.getTime() < startOfTodaySydney.getTime()
    })
    .map((i) => i.id)
  if (ids.length === 0) return { marked: 0 }
  // Re-check the status in the same statement: a payment that settled the invoice since the read above
  // must not be overwritten to OVERDUE.
  const res = await prisma.invoice.updateMany({
    where: { id: { in: ids }, status: { in: ['ISSUED', 'SENT', 'PARTIALLY_PAID'] } },
    data: { status: 'OVERDUE' },
  })
  return { marked: res.count }
}
