import type { Metadata } from 'next'
import { ProjectLifecycle } from '@prisma/client'
import Link from 'next/link'
import { Breadcrumb, DASHBOARD_CRUMB } from '@/components/Breadcrumb'
import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { listActivePackages } from '@/lib/domain/package'
import { listInvoiceTemplates } from '@/lib/domain/finance'
import { titleCase } from '@/lib/text'
import { AppShell } from '../../AppShell'
import { PageContainer } from '@/components/PageContainer'
import { InvoiceEditor } from '../../jobs/[id]/InvoiceEditor'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'New invoice - Moments' }

// Invoicing is allowed at any active stage (SN-style deposit invoices secure a booking); only
// closed jobs are excluded.
const CLOSED: ProjectLifecycle[] = ['CANCELLED', 'LOST']

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ job?: string; client?: string }> }) {
  const user = await requireRole('/finance/new')
  const sp = await searchParams
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  if (sp.job) {
    const project = await prisma.project.findUnique({
      where: { id: sp.job },
      select: { id: true, name: true, code: true, lifecycleStatus: true, client: { select: { displayName: true } } },
    })
    if (!project) notFound()
    const packages = (await listActivePackages()).map((p) => ({
      id: p.id,
      name: p.name,
      price: p.basePriceInclGst.toString(),
      description: p.description,
      inclusions: p.inclusions,
      isAddOn: p.isAddOn,
    }))
    const templates = await listInvoiceTemplates()
    const isClosed = CLOSED.includes(project.lifecycleStatus)

    return (
      <AppShell user={user} csrf={csrf} active="finance">
      <PageContainer variant="narrow">
        <Breadcrumb items={[DASHBOARD_CRUMB, { label: 'Payments', href: '/finance' }, { label: 'New invoice' }]} />
        <h1 className="mt-2 font-serif text-xl font-semibold text-ink">New invoice</h1>
        <p className="mt-1 text-sm text-ink-muted">{project.client.displayName} · {project.name} ({project.code})</p>
        {isClosed ? (
          <p className="mt-4 rounded-md border border-dashed border-line bg-surface px-4 py-6 text-sm text-ink-muted">
            This job is closed ({titleCase(project.lifecycleStatus.replace(/_/g, ' '))}). Reopen it before invoicing.
          </p>
        ) : (
          <InvoiceEditor csrf={csrf} projectId={project.id} packages={packages} templates={templates} />
        )}
      </PageContainer>
    </AppShell>
    )
  }

  // Reached from a client ("+ New invoice" on the client page) - scope the picker to that client.
  const jobs = await prisma.project.findMany({
    where: { lifecycleStatus: { notIn: CLOSED }, archivedAt: null, ...(sp.client ? { clientId: sp.client } : {}) },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, name: true, code: true, client: { select: { displayName: true } } },
  })

  // One active job for this client: skip the picker and open its editor directly.
  if (sp.client && jobs.length === 1 && jobs[0]) {
    redirect(`/finance/new?job=${jobs[0].id}`)
  }

  const clientName = sp.client ? jobs[0]?.client.displayName : null

  return (
    <AppShell user={user} csrf={csrf} active="finance">
      <PageContainer variant="narrow">
      <Breadcrumb items={[DASHBOARD_CRUMB, { label: 'Payments', href: '/finance' }, { label: 'New invoice' }]} />
      <h1 className="mt-2 font-serif text-xl font-semibold text-ink">New invoice</h1>
      <p className="mt-1 text-sm text-ink-muted">{clientName ? `Choose a job for ${clientName} to invoice.` : 'Choose a job to invoice.'}</p>
      {jobs.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-line bg-surface px-4 py-6 text-center text-sm text-ink-muted">
          {sp.client
            ? 'This client has no active jobs. Create a job (or convert an enquiry) first, then invoice it here.'
            : 'No jobs yet. Create a job (or convert an enquiry) first, then invoice it here.'}
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {jobs.map((j) => (
            <li key={j.id}>
              <Link href={`/finance/new?job=${j.id}`} className="flex items-center justify-between gap-2 rounded-md border border-line bg-surface px-4 py-3 shadow-sm hover:border-line-strong">
                <span className="text-ink">{j.client.displayName} · {j.name}</span>
                <span className="text-sm text-ink-muted">{j.code}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
    </AppShell>
  )
}
