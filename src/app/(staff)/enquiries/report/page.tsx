import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { formatSydneyDate } from '@/lib/time'
import { titleCase } from '@/lib/text'
import { ENQUIRY_STAGE_LABEL } from '@/features/enquiries/status'
import { Breadcrumb, DASHBOARD_CRUMB } from '@/components/Breadcrumb'
import { PrintButton } from '@/components/PrintButton'
import { ListReportDoc, type ReportColumn } from '@/components/ListReportDoc'
import { AppShell } from '../../AppShell'
import { PageContainer } from '@/components/PageContainer'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Leads report - Moments' }

const COLUMNS: ReportColumn[] = [
  { label: 'Client' }, { label: 'Partner' }, { label: 'Event' }, { label: 'Event date' }, { label: 'Status' }, { label: 'Received' },
]

export default async function EnquiriesReportPage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const user = await requireRole('/enquiries/report')
  const { ids: idsParam } = await searchParams
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  const ids = (idsParam ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const [company, enquiries] = await Promise.all([
    prisma.company.findFirst({ select: { name: true } }),
    ids.length
      ? prisma.enquiry.findMany({
          where: { id: { in: ids } },
          orderBy: { createdAt: 'desc' },
          select: { name: true, partnerName: true, eventType: true, eventDate: true, status: true, createdAt: true },
        })
      : Promise.resolve([]),
  ])

  const rows = enquiries.map((e) => [
    e.name,
    e.partnerName ?? '-',
    e.eventType ? titleCase(e.eventType) : '-',
    e.eventDate ? formatSydneyDate(e.eventDate) : '-',
    ENQUIRY_STAGE_LABEL[e.status] ?? titleCase(e.status),
    formatSydneyDate(e.createdAt),
  ])

  const generatedAt = formatSydneyDate(new Date())
  const doc = (
    <ListReportDoc
      companyName={company?.name ?? 'Moments'}
      title="Leads report"
      columns={COLUMNS}
      rows={rows}
      generatedBy={user.name}
      generatedAt={generatedAt}
    />
  )

  return (
    <>
      <div className="print:hidden">
        <AppShell user={user} csrf={csrf} active="enquiries">
          <PageContainer variant="narrow">
            <Breadcrumb items={[DASHBOARD_CRUMB, { label: 'Leads', href: '/enquiries' }, { label: 'Report' }]} />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <h1 className="font-serif text-xl font-semibold text-ink">Leads report</h1>
              <PrintButton label="Download PDF" />
            </div>
            <p className="mt-1 text-sm text-ink-muted">The selected leads. Use your browser&rsquo;s &ldquo;Save as PDF&rdquo; in the print dialog.</p>
            <div className="mt-5">{doc}</div>
          </PageContainer>
        </AppShell>
      </div>
      <div className="hidden print:block">{doc}</div>
    </>
  )
}
