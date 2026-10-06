import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { JOB_SHOOT_SELECT, shootDateOfJob } from '@/lib/domain/deadline'
import { formatSydneyDate } from '@/lib/time'
import { statusLabel } from '@/features/projects/lifecycle'
import { Breadcrumb, DASHBOARD_CRUMB } from '@/components/Breadcrumb'
import { PrintButton } from '@/components/PrintButton'
import { ListReportDoc, type ReportColumn } from '@/components/ListReportDoc'
import { AppShell } from '../../AppShell'
import { PageContainer } from '@/components/PageContainer'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Jobs report - Moments' }

const COLUMNS: ReportColumn[] = [
  { label: 'Client' }, { label: 'Job' }, { label: 'Status' }, { label: 'Shoot date' }, { label: 'Enquired' },
]

export default async function JobsReportPage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const user = await requireRole('/jobs/report')
  const { ids: idsParam } = await searchParams
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  const ids = (idsParam ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const [company, jobs] = await Promise.all([
    prisma.company.findFirst({ select: { name: true } }),
    ids.length
      ? prisma.project.findMany({
          where: { id: { in: ids } },
          orderBy: { enquiryReceivedAt: 'desc' },
          select: {
            name: true,
            lifecycleStatus: true,
            enquiryReceivedAt: true,
            client: { select: { displayName: true } },
            ...JOB_SHOOT_SELECT,
          },
        })
      : Promise.resolve([]),
  ])

  const rows = jobs.map((j) => [
    j.client.displayName,
    j.name,
    statusLabel(j.lifecycleStatus),
    ((at) => (at ? formatSydneyDate(at) : '-'))(shootDateOfJob(j)),
    formatSydneyDate(j.enquiryReceivedAt),
  ])

  const generatedAt = formatSydneyDate(new Date())
  const doc = (
    <ListReportDoc
      companyName={company?.name ?? 'Moments'}
      title="Jobs report"
      columns={COLUMNS}
      rows={rows}
      generatedBy={user.name}
      generatedAt={generatedAt}
    />
  )

  return (
    <>
      <div className="print:hidden">
        <AppShell user={user} csrf={csrf} active="jobs">
          <PageContainer variant="narrow">
            <Breadcrumb items={[DASHBOARD_CRUMB, { label: 'Jobs', href: '/jobs' }, { label: 'Report' }]} />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <h1 className="font-serif text-xl font-semibold text-ink">Jobs report</h1>
              <PrintButton label="Download PDF" />
            </div>
            <p className="mt-1 text-sm text-ink-muted">The selected jobs. Use your browser&rsquo;s &ldquo;Save as PDF&rdquo; in the print dialog.</p>
            <div className="mt-5">{doc}</div>
          </PageContainer>
        </AppShell>
      </div>
      <div className="hidden print:block">{doc}</div>
    </>
  )
}
