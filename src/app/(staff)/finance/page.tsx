import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { Prisma } from '@prisma/client'
import { StatusTag } from '@/components/ui/StatusTag'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { getInvoiceBalance } from '@/lib/domain/money'
import { INVOICE_MONEY_SELECT, toInvoiceMoneyInput } from '@/lib/domain/invoice-money'
import { formatAud } from '@/lib/money'
import { formatSydneyDate } from '@/lib/time'
import { titleCase } from '@/lib/text'
import { INVOICE_KIND, invoiceGroup } from '@/features/finance/invoice-status'
import { AppShell } from '../AppShell'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Payments - Moments' }

type Row = {
  id: string
  number: string
  client: string
  status: string
  issued: Date | null
  due: Date | null
  total: string
  balance: string
}

/** Clean, borderless invoice table matching the Clients list (uppercase muted head, hover rows). */
function InvoiceTable({ rows }: { rows: Row[] }) {
  return (
    <div className="overflow-x-auto">
      {/* Fixed layout + shared column widths so every group's table (Outstanding, Paid, ...) lines up
          instead of each one auto-sizing its columns to its own rows. */}
      <table className="w-full table-fixed border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            <th className="w-[15%] py-2 pr-4 font-medium">Invoice</th>
            <th className="w-[24%] py-2 pr-4 font-medium">Client</th>
            <th className="w-[13%] py-2 pr-4 font-medium">Issued</th>
            <th className="w-[10%] py-2 pr-4 font-medium">Due</th>
            <th className="w-[13%] py-2 pr-4 text-right font-medium">Total</th>
            <th className="w-[13%] py-2 pr-4 text-right font-medium">Balance</th>
            <th className="w-[12%] py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="group border-b border-line transition-colors last:border-b-0 hover:bg-paper">
              <td className="py-3 pr-4">
                <Link href={`/finance/${row.id}`} className="tabular block truncate font-medium text-accent-ink hover:underline">{row.number}</Link>
              </td>
              <td className="py-3 pr-4">
                <Link href={`/finance/${row.id}`} className="block truncate font-medium text-ink transition-colors group-hover:text-accent-ink">{row.client}</Link>
              </td>
              <td className="tabular py-3 pr-4 text-ink-muted">{row.issued ? formatSydneyDate(row.issued) : '-'}</td>
              <td className="tabular py-3 pr-4 text-ink-muted">{row.due ? formatSydneyDate(row.due) : '-'}</td>
              <td className="tabular py-3 pr-4 text-right text-ink">{row.total}</td>
              <td className="tabular py-3 pr-4 text-right text-ink">{row.balance}</td>
              <td className="py-3">
                <StatusTag kind={INVOICE_KIND[row.status] ?? 'hold'}>{titleCase(row.status)}</StatusTag>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** A grouped section: a Clients-style "Title · N" toolbar over its own clean table. */
function Group({ title, rows, first }: { title: string; rows: Row[]; first: boolean }) {
  if (rows.length === 0) return null
  return (
    <section className={first ? 'mt-7' : 'mt-10'}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-2">
        <div className="text-sm text-ink">
          {title} <span className="text-ink-muted">· {rows.length}</span>
        </div>
      </div>
      <InvoiceTable rows={rows} />
    </section>
  )
}

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireRole('/finance')
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  const sp = await searchParams
  const q = (sp.q ?? '').trim()
  const where: Prisma.InvoiceWhereInput = q
    ? {
        OR: [
          { invoiceNumber: { contains: q, mode: 'insensitive' } },
          { project: { client: { displayName: { contains: q, mode: 'insensitive' } } } },
        ],
      }
    : {}

  const invoices = await prisma.invoice.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      invoiceNumber: true,
      issuedAt: true,
      project: { select: { id: true, client: { select: { displayName: true } } } },
      ...INVOICE_MONEY_SELECT, // status, total, dueAt + the ledger facts for the balance
    },
  })

  // Balance per row is the ledger-derived `owed` (credit-aware, overpayment clamped) — one derivation
  // shared with the invoice detail and job views (docs/25 Part 1). The nested select keeps it a single
  // query, so the list stays free of N+1.
  const rows: Row[] = invoices.map((inv) => ({
    id: inv.id,
    number: inv.invoiceNumber,
    client: inv.project.client.displayName,
    status: inv.status,
    issued: inv.issuedAt,
    due: inv.dueAt,
    total: formatAud(inv.total),
    balance: formatAud(getInvoiceBalance(toInvoiceMoneyInput(inv)).owed),
  }))
  const outstanding = rows.filter((r) => invoiceGroup(r.status) === 'outstanding')
  const paid = rows.filter((r) => invoiceGroup(r.status) === 'paid')
  const other = rows.filter((r) => invoiceGroup(r.status) === 'other')

  return (
    <AppShell user={user} csrf={csrf} active="finance" bareHeader>
      <div className="w-full">
        {/* Header (shared PageHeader pattern: uppercase section eyebrow, then title + description). */}
        <div className="text-xs font-semibold uppercase tracking-widest text-muted">Operations</div>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-ink">Payments</h1>
            <p className="mt-1 text-sm text-ink-muted">Track invoices, balances and payment status.</p>
          </div>
          <div className="flex items-center gap-2">
            <form method="get" className="relative">
              <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
              </svg>
              <input
                name="q"
                defaultValue={q}
                placeholder="Search invoices"
                aria-label="Search invoices"
                className="h-9 w-64 rounded-md border border-line bg-surface pl-9 pr-3 text-sm text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-accent focus:ring-1 focus:ring-accent"
              />
            </form>
            <Link
              href="/finance/new"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-sunk"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              New invoice
            </Link>
          </div>
        </div>

        {/* Groups */}
        {rows.length === 0 ? (
          <p className="py-16 text-center text-sm text-ink-muted">
            {q ? `No invoices match "${q}".` : 'No invoices yet. Create one with New invoice, or raise it from a job.'}
          </p>
        ) : (
          <>
            <Group title="Outstanding" rows={outstanding} first />
            <Group title="Paid" rows={paid} first={outstanding.length === 0} />
            <Group title="Draft & void" rows={other} first={outstanding.length === 0 && paid.length === 0} />
          </>
        )}
      </div>
    </AppShell>
  )
}
