import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { INVOICE_MONEY_SELECT, toInvoiceMoneyInput } from '@/lib/domain/invoice-money'
import { getInvoiceBalance, nextPaymentDue } from '@/lib/domain/money'
import { formatAud } from '@/lib/money'
import { formatSydneyDate, sydneyDateTimeParts } from '@/lib/time'
import { titleCase } from '@/lib/text'
import { Breadcrumb, DASHBOARD_CRUMB } from '@/components/Breadcrumb'
import { PrintButton } from '@/components/PrintButton'
import { AppShell } from '../../AppShell'
import { PageContainer } from '@/components/PageContainer'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Payments report - Moments' }

const PAGE_CSS = '@media print{@page{size:A4;margin:14mm}.pay-report{box-shadow:none!important;border:0!important}}'

type ReportRow = { number: string; client: string; service: string; status: string; date: string; amount: string }

export default async function PaymentsReportPage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const user = await requireRole('/finance/report')
  const { ids: idsParam } = await searchParams
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  const ids = (idsParam ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const [company, invoices] = await Promise.all([
    prisma.company.findFirst({ select: { name: true } }),
    ids.length
      ? prisma.invoice.findMany({
          where: { id: { in: ids } },
          orderBy: { createdAt: 'desc' },
          select: {
            ...INVOICE_MONEY_SELECT,
            invoiceNumber: true,
            issuedAt: true,
            project: {
              select: {
                client: { select: { displayName: true } },
                eventType: true,
              },
            },
            payments: { select: { transactions: { select: { type: true, amount: true, createdAt: true } } } },
          },
        })
      : Promise.resolve([]),
  ])

  const today = sydneyDateTimeParts(new Date()).date
  let totalNum = 0
  const rows: ReportRow[] = invoices.map((inv) => {
    const isPaid = inv.status === 'PAID'
    const charges = inv.payments.flatMap((p) => p.transactions).filter((t) => t.type === 'CHARGE')
    const paidAt = charges.length ? new Date(Math.max(...charges.map((c) => c.createdAt.getTime()))) : inv.issuedAt

    const nextDue = isPaid ? null : (nextPaymentDue(getInvoiceBalance(toInvoiceMoneyInput(inv))) ?? inv.dueAt)
    const overdue = nextDue != null && sydneyDateTimeParts(nextDue).date < today
    const status = isPaid ? 'Paid' : overdue ? 'Overdue' : 'Due'
    const dateSource = isPaid ? paidAt : nextDue
    totalNum += inv.total.toNumber()
    return {
      number: inv.invoiceNumber,
      client: inv.project.client.displayName,
      service: titleCase(inv.project.eventType ?? 'Photography'),
      status,
      date: dateSource ? formatSydneyDate(dateSource) : '-',
      amount: formatAud(inv.total),
    }
  })
  const totalLabel = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(totalNum)
  const generatedAt = formatSydneyDate(new Date())

  const doc = (
    <div className="pay-report mx-auto w-full max-w-[210mm] rounded-md border border-line bg-surface p-[14mm] text-ink shadow-sm print:max-w-none print:rounded-none print:p-0 print:shadow-none">
      <style>{PAGE_CSS}</style>
      <header className="flex items-start justify-between gap-6 border-b border-line-strong pb-4">
        <div>
          <div className="font-serif text-2xl font-semibold uppercase tracking-[0.18em] leading-none">{company?.name ?? 'Moments'}</div>
          <div className="mt-1.5 text-xs uppercase tracking-[0.2em] text-muted">Photography and Film &middot; Sydney</div>
        </div>
        <div className="text-right">
          <div className="text-xs font-bold uppercase tracking-wide text-muted">Payments report</div>
          <div className="mt-1 text-base font-semibold tabular">{totalLabel}</div>
          <div className="mt-1 text-xs text-ink-muted">Generated {generatedAt}</div>
        </div>
      </header>

      <h1 className="mt-6 text-lg font-semibold">
        Selected invoices <span className="tabular text-ink-muted">({rows.length})</span>
      </h1>

      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-ink-muted">No invoices selected.</p>
      ) : (
        <table className="mt-4 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line-strong text-left text-xs uppercase tracking-wide text-muted">
              <th className="w-[6%] py-2 pr-2 font-bold">#</th>
              <th className="w-[30%] py-2 pr-2 font-bold">Client / Job</th>
              <th className="w-[18%] py-2 pr-2 font-bold">Invoice</th>
              <th className="w-[14%] py-2 pr-2 font-bold">Status</th>
              <th className="w-[16%] py-2 pr-2 font-bold">Date</th>
              <th className="w-[16%] py-2 text-right font-bold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.number} className="border-b border-line align-top">
                <td className="tabular py-2 pr-2 text-ink-muted">{i + 1}</td>
                <td className="py-2 pr-2"><span className="font-medium">{r.client}</span><span className="block text-xs text-ink-muted">{r.service}</span></td>
                <td className="tabular py-2 pr-2">{r.number}</td>
                <td className="py-2 pr-2">{r.status}</td>
                <td className="tabular py-2 pr-2 text-ink-muted">{r.date}</td>
                <td className="tabular py-2 text-right font-medium">{r.amount}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-line-strong font-semibold">
              <td className="py-2 pr-2" colSpan={5}>Total</td>
              <td className="tabular py-2 text-right">{totalLabel}</td>
            </tr>
          </tfoot>
        </table>
      )}

      <footer className="mt-8 border-t border-line pt-3 text-xs leading-relaxed text-muted">
        {rows.length} invoice{rows.length === 1 ? '' : 's'} &middot; Total {totalLabel} &middot; Generated by {user.name} on {generatedAt}.
      </footer>
    </div>
  )

  return (
    <>
      <div className="print:hidden">
        <AppShell user={user} csrf={csrf} active="finance">
          <PageContainer variant="narrow">
            <Breadcrumb items={[DASHBOARD_CRUMB, { label: 'Payments', href: '/finance' }, { label: 'Report' }]} />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <h1 className="font-serif text-xl font-semibold text-ink">Payments report</h1>
              <PrintButton label="Download PDF" />
            </div>
            <p className="mt-1 text-sm text-ink-muted">
              The selected invoices. Use your browser&rsquo;s &ldquo;Save as PDF&rdquo; in the print dialog.
            </p>
            <div className="mt-5">{doc}</div>
          </PageContainer>
        </AppShell>
      </div>

      {/* Print target: only the report sheet prints - no app chrome. */}
      <div className="hidden print:block">{doc}</div>
    </>
  )
}
