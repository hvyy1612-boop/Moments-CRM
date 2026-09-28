import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { formatSydneyDate } from '@/lib/time'
import { titleCase } from '@/lib/text'
import { Breadcrumb, DASHBOARD_CRUMB } from '@/components/Breadcrumb'
import { PrintButton } from '@/components/PrintButton'
import { ListReportDoc, type ReportColumn } from '@/components/ListReportDoc'
import { AppShell } from '../../AppShell'
import { PageContainer } from '@/components/PageContainer'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Clients report - Moments' }

const COLUMNS: ReportColumn[] = [
  { label: 'Client' }, { label: 'Email' }, { label: 'Phone' }, { label: 'Source' }, { label: 'Client since' }, { label: 'Jobs', align: 'right' },
]

export default async function ClientsReportPage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const user = await requireRole('/clients/report')
  const { ids: idsParam } = await searchParams
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  const ids = (idsParam ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const [company, clients] = await Promise.all([
    prisma.company.findFirst({ select: { name: true } }),
    ids.length
      ? prisma.client.findMany({
          where: { id: { in: ids } },
          orderBy: { displayName: 'asc' },
          select: {
            displayName: true,
            email: true,
            phone: true,
            source: true,
            createdAt: true,
            _count: { select: { projects: true } },
          },
        })
      : Promise.resolve([]),
  ])

  const rows = clients.map((c) => [
    c.displayName,
    c.email,
    c.phone ?? '-',
    c.source ? titleCase(c.source) : '-',
    formatSydneyDate(c.createdAt),
    String(c._count.projects),
  ])

  const generatedAt = formatSydneyDate(new Date())
  const doc = (
    <ListReportDoc
      companyName={company?.name ?? 'Moments'}
      title="Clients report"
      columns={COLUMNS}
      rows={rows}
      generatedBy={user.name}
      generatedAt={generatedAt}
    />
  )

  return (
    <>
      <div className="print:hidden">
        <AppShell user={user} csrf={csrf} active="clients">
          <PageContainer variant="narrow">
            <Breadcrumb items={[DASHBOARD_CRUMB, { label: 'Clients', href: '/clients' }, { label: 'Report' }]} />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <h1 className="font-serif text-xl font-semibold text-ink">Clients report</h1>
              <PrintButton label="Download PDF" />
            </div>
            <p className="mt-1 text-sm text-ink-muted">The selected clients. Use your browser&rsquo;s &ldquo;Save as PDF&rdquo; in the print dialog.</p>
            <div className="mt-5">{doc}</div>
          </PageContainer>
        </AppShell>
      </div>
      <div className="hidden print:block">{doc}</div>
    </>
  )
}
