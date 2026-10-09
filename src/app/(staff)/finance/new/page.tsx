import type { Metadata } from 'next'
import { ProjectLifecycle } from '@prisma/client'
import { Breadcrumb, DASHBOARD_CRUMB } from '@/components/Breadcrumb'
import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { JOB_SHOOT_SELECT, shootDateOfJob } from '@/lib/domain/deadline'
import { listActivePackages } from '@/lib/domain/package'
import { currentNumberYear, formatRecordNumber } from '@/lib/domain/numbering'
import { sydneyYmd } from '@/lib/time'
import { titleCase } from '@/lib/text'
import { AppShell } from '../../AppShell'
import { PageContainer } from '@/components/PageContainer'
import { InvoiceEditor } from '../../jobs/[id]/InvoiceEditor'
import { NewInvoiceJobPicker } from './NewInvoiceJobPicker'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'New invoice - Moments' }

// Invoicing is allowed at any stage (SN-style deposit invoices secure a booking); only a cancelled job
// is excluded.
const CLOSED: ProjectLifecycle[] = ['CANCELLED']

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ job?: string; client?: string }> }) {
  const user = await requireRole('/finance/new')
  const sp = await searchParams
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  if (sp.job) {
    const project = await prisma.project.findUnique({
      where: { id: sp.job },
      select: {
        id: true, name: true, code: true, companyId: true, lifecycleStatus: true,
        client: { select: { displayName: true, email: true, phone: true } },
        // The job's shoot date drives the shoot-date payment schedules ("balance 14 days before the shoot").
        ...JOB_SHOOT_SELECT,
      },
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
    const isClosed = CLOSED.includes(project.lifecycleStatus)

    // Prefills for the form (all editable): a preview of the next invoice number (read-only peek, does
    // NOT consume the counter - creation still auto-allocates), today's issue date, and the type derived
    // from whether this job has been invoiced before (first = Deposit, later = Balance).
    const year = currentNumberYear()
    const counter = await prisma.numberCounter.findUnique({
      where: { companyId_type_year: { companyId: project.companyId, type: 'INVOICE', year } },
      select: { value: true },
    })
    const numberPreview = formatRecordNumber('INVOICE', year, (counter?.value ?? 0) + 1)
    const priorInvoices = await prisma.invoice.count({ where: { projectId: project.id, status: { not: 'VOID' } } })
    const defaultType = priorInvoices === 0 ? 'DEPOSIT' : 'BALANCE'
    const td = sydneyYmd(new Date())
    const issueDefault = `${td.year}-${String(td.month).padStart(2, '0')}-${String(td.day).padStart(2, '0')}`
    const shoot = shootDateOfJob(project)
    const sd = shoot ? sydneyYmd(shoot) : null
    const shootDate = sd ? `${sd.year}-${String(sd.month).padStart(2, '0')}-${String(sd.day).padStart(2, '0')}` : null

    return (
      <AppShell user={user} csrf={csrf} active="finance">
      <PageContainer variant="standard">
        {/* Full width like every page: fields, products, then totals + notes (right) beside the payment schedule (left). */}
        <Breadcrumb items={[DASHBOARD_CRUMB, { label: 'Payments', href: '/finance' }, { label: 'New invoice' }]} />
        <h1 className="mt-2 text-2xl font-semibold text-ink">New invoice</h1>
        {isClosed ? (
          <p className="mt-4 rounded-md border border-dashed border-line bg-surface px-4 py-6 text-sm text-ink-muted">
            This job is closed ({titleCase(project.lifecycleStatus.replace(/_/g, ' '))}). Reopen it before invoicing.
          </p>
        ) : (
          <InvoiceEditor
            csrf={csrf}
            projectId={project.id}
            packages={packages}
            contact={{
              jobName: project.name,
              clientName: project.client.displayName,
              clientEmail: project.client.email ?? '',
              clientPhone: project.client.phone ?? '',
              numberPreview,
              defaultType,
              issueDate: issueDefault,
              shootDate,
            }}
          />
        )}
      </PageContainer>
    </AppShell>
    )
  }

  // Reached from a client ("+ New invoice" on the client page) - scope the picker to that client.
  const jobs = await prisma.project.findMany({
    where: { lifecycleStatus: { notIn: CLOSED }, ...(sp.client ? { clientId: sp.client } : {}) },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, name: true, code: true, lifecycleStatus: true, client: { select: { displayName: true } } },
  })

  // One active job for this client: skip the picker and open its editor directly.
  if (sp.client && jobs.length === 1 && jobs[0]) {
    redirect(`/finance/new?job=${jobs[0].id}`)
  }

  const clientName = sp.client ? jobs[0]?.client.displayName : null

  return (
    <AppShell user={user} csrf={csrf} active="finance">
      <PageContainer variant="standard">
      <Breadcrumb items={[DASHBOARD_CRUMB, { label: 'Payments', href: '/finance' }, { label: 'New invoice' }]} />
      <h1 className="mt-2 text-2xl font-semibold text-ink">New invoice</h1>
      <p className="mt-1 max-w-prose text-sm text-ink-muted">{clientName ? `Choose a job for ${clientName} to invoice.` : 'Choose a job to invoice.'}</p>
      {jobs.length === 0 ? (
        <p className="mt-6 rounded-md border border-dashed border-line bg-surface px-4 py-6 text-center text-sm text-ink-muted">
          {sp.client
            ? 'This client has no active jobs. Create a job (or convert a lead) first, then invoice it here.'
            : 'No jobs yet. Create a job (or convert a lead) first, then invoice it here.'}
        </p>
      ) : (
        <div className="mt-7">
          <NewInvoiceJobPicker
            rows={jobs.map((j) => ({
              id: j.id,
              code: j.code,
              client: j.client.displayName,
              // A lead's booking file (quote accepted, deposit not paid) is invoiceable - that is where the
              // deposit invoice goes - but it is not a confirmed job yet, so say so.
              job: j.lifecycleStatus === 'BOOKING_REQUESTED' ? `${j.name} (lead, awaiting deposit)` : j.name,
            }))}
          />
        </div>
      )}
    </PageContainer>
    </AppShell>
  )
}
