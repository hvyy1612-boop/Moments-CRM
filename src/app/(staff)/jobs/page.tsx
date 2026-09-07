import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { can } from '@/lib/auth/authz'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { formatSydneyDate } from '@/lib/time'
import { resolveLabel, type StatusLabel } from '@/features/projects/labels'
import { CLOSED_STATUSES } from '@/features/projects/lifecycle'
import { stageLabel } from '@/features/projects/workflow'
import { getCompanyStatusLabels } from '@/lib/domain/status-labels'
import { StatusPicker } from '@/features/projects/components/StatusPicker'
import { AppShell } from '../AppShell'
import { JobSortSelect, JOB_DEFAULT_SORT, type JobSortValue } from './JobSortSelect'
import { JobFilterMenu } from './JobFilterMenu'
import { JobRowMenu } from './JobRowMenu'
import { AddJobButton } from './AddJobButton'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Jobs - Moments' }

const SORTS: JobSortValue[] = ['newest', 'oldest', 'client-asc']

type Row = {
  id: string
  code: string
  name: string
  client: string
  clientId: string
  label: StatusLabel
  closed: boolean
  enquiredAt: Date
  nextTask: string | null
  nextStage: string | null
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string; status?: string; task?: string; tab?: string }>
}) {
  const user = await requireRole('/jobs')
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  const sp = await searchParams
  const q = (sp.q ?? '').trim()
  const sort: JobSortValue = SORTS.includes(sp.sort as JobSortValue) ? (sp.sort as JobSortValue) : JOB_DEFAULT_SORT
  const status = sp.status ?? ''
  const task = sp.task ?? ''
  const tab: 'active' | 'completed' = sp.tab === 'completed' ? 'completed' : 'active'

  const [projects, labels] = await Promise.all([
    prisma.project.findMany({
      // Jobs = Projects. A case becomes a Project only on conversion / direct booking, so membership is
      // by ENTITY - never by commercial status (docs/24). The active/closed split is applied below.
      orderBy: { enquiryReceivedAt: 'desc' },
      include: {
        client: { select: { id: true, displayName: true } },
        // All staff tasks (non-AUTO, non-cancelled): the next pending one AND whether the checklist is
        // fully done, which drives the "Complete" tag below (leaving Active is a separate, lifecycle call).
        workItems: {
          where: { type: { not: 'AUTO' }, status: { not: 'CANCELLED' } },
          orderBy: { order: 'asc' },
          select: { title: true, stage: true, status: true },
        },
      },
    }),
    getCompanyStatusLabels(),
  ])
  const canEdit = can(user, 'PROJECT_EDIT')

  let rows: Row[] = projects.map((p) => {
    const next = p.workItems.find((t) => t.status !== 'COMPLETED') // first pending staff task
    const checklistDone = p.workItems.length > 0 && !next
    // The tag shows "Complete" as soon as the checklist is finished (no manual override). A job only
    // truly leaves Active once it is ALSO paid - that is the lifecycle auto-complete, handled elsewhere;
    // so a delivered-but-unpaid job reads "Complete" yet stays in the list until the balance is settled.
    const label =
      !p.statusLabelId && checklistDone
        ? (labels.find((l) => l.stage === 'COMPLETED') ?? resolveLabel(p, labels))
        : resolveLabel(p, labels)
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      client: p.client.displayName,
      clientId: p.client.id,
      label,
      // Closed grouping is decided by the true operational lifecycle, never by a display label - a
      // custom status label can't make a cancelled/closed job reappear in Active (docs/24 Increment 1).
      closed: CLOSED_STATUSES.has(p.lifecycleStatus),
      enquiredAt: p.enquiryReceivedAt,
      nextTask: next?.title ?? null,
      nextStage: next?.stage ?? null,
    }
  })

  // Search + next-task filter first, then the Active/Completed tab split, then any status narrowing.
  if (q) {
    const needle = q.toLowerCase()
    rows = rows.filter((r) => [r.client, r.name, r.code].some((f) => f.toLowerCase().includes(needle)))
  }
  if (task === 'has') rows = rows.filter((r) => r.nextTask != null)
  if (task === 'none') rows = rows.filter((r) => r.nextTask == null)

  // Active = still being worked on; Completed = the job has finished (or otherwise left the pipeline).
  // Nothing is deleted - a finished job just moves to the Completed tab, always reachable on the UI.
  const activeCount = rows.filter((r) => !r.closed).length
  const completedCount = rows.filter((r) => r.closed).length
  rows = rows.filter((r) => (tab === 'completed' ? r.closed : !r.closed))
  if (status) rows = rows.filter((r) => r.label.id === status)

  if (sort === 'oldest') rows = [...rows].sort((a, b) => a.enquiredAt.getTime() - b.enquiredAt.getTime())
  else if (sort === 'client-asc') rows = [...rows].sort((a, b) => a.client.localeCompare(b.client))

  // Carried to the job detail as ?back so its in-app "Jobs" link returns to this exact filtered list.
  const listQs = new URLSearchParams()
  if (q) listQs.set('q', q)
  if (sort !== JOB_DEFAULT_SORT) listQs.set('sort', sort)
  if (status) listQs.set('status', status)
  if (task) listQs.set('task', task)
  if (tab === 'completed') listQs.set('tab', tab)
  const listQsStr = listQs.toString()
  const backParam = listQsStr ? `?back=${encodeURIComponent(listQsStr)}` : ''

  // Tab links preserve the other params (search/sort/filter) and just flip Active <-> Completed.
  const tabHref = (t: 'active' | 'completed') => {
    const p = new URLSearchParams()
    if (q) p.set('q', q)
    if (sort !== JOB_DEFAULT_SORT) p.set('sort', sort)
    if (status) p.set('status', status)
    if (task) p.set('task', task)
    if (t === 'completed') p.set('tab', t)
    const qs = p.toString()
    return qs ? `/jobs?${qs}` : '/jobs'
  }

  return (
    <AppShell user={user} csrf={csrf} active="jobs" bareHeader>
      <div className="w-full">
        <div className="text-xs text-muted">Studio / Jobs</div>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-md">
            <h1 className="text-3xl font-semibold text-ink">Jobs</h1>
            <p className="mt-1 text-sm text-ink-muted">Booked work from planning through the shoot, editing and delivery.</p>
          </div>
          <div className="flex items-center gap-2">
            <form method="get" className="relative">
              {sort !== JOB_DEFAULT_SORT ? <input type="hidden" name="sort" value={sort} /> : null}
              {status ? <input type="hidden" name="status" value={status} /> : null}
              {task ? <input type="hidden" name="task" value={task} /> : null}
              {tab === 'completed' ? <input type="hidden" name="tab" value={tab} /> : null}
              <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
              </svg>
              <input name="q" defaultValue={q} placeholder="Search jobs" aria-label="Search jobs" className="h-9 w-64 rounded-md border border-line bg-surface pl-9 pr-3 text-sm text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-accent focus:ring-1 focus:ring-accent" />
            </form>
            {canEdit ? <AddJobButton csrf={csrf} /> : null}
          </div>
        </div>

        <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-2">
          <div className="flex items-center gap-1" role="tablist" aria-label="Job status">
            <Link
              href={tabHref('active')}
              role="tab"
              aria-selected={tab === 'active'}
              className={`rounded-md px-3 py-1 text-sm transition-colors ${tab === 'active' ? 'bg-sunk font-medium text-ink' : 'text-ink-muted hover:text-ink'}`}
            >
              Active <span className="tabular text-ink-muted">· {activeCount}</span>
            </Link>
            <Link
              href={tabHref('completed')}
              role="tab"
              aria-selected={tab === 'completed'}
              className={`rounded-md px-3 py-1 text-sm transition-colors ${tab === 'completed' ? 'bg-sunk font-medium text-ink' : 'text-ink-muted hover:text-ink'}`}
            >
              Completed <span className="tabular text-ink-muted">· {completedCount}</span>
            </Link>
          </div>
          <div className="flex items-center gap-1">
            <JobFilterMenu statuses={labels.map((l) => ({ id: l.id, name: l.name }))} status={status} task={task} />
            <JobSortSelect value={sort} />
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="py-16 text-center text-sm text-ink-muted">
            {q || status || task
              ? 'No jobs match these filters.'
              : tab === 'completed'
                ? 'No completed jobs yet.'
                : activeCount + completedCount > 0
                  ? 'No active jobs right now - everything is complete.'
                  : 'No jobs yet. Use Add job to create one.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-4 font-medium">Client</th>
                  <th className="py-2 pr-4 font-medium">Job</th>
                  <th className="py-2 pr-4 font-medium">Enquired</th>
                  <th className="py-2 pr-4 font-medium">Next task</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="w-10 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="group border-b border-line align-top transition-colors last:border-b-0 hover:bg-paper">
                    <td className="py-3 pr-4">
                      {/* Primary identifier opens the JOB (its task workflow), mirroring the Enquiries
                          list where the name opens the case - not the client profile, which was sending
                          staff away from the tasks. The client profile stays reachable via the row menu. */}
                      <Link href={`/jobs/${row.id}${backParam}`} className="font-medium text-ink transition-colors hover:text-accent-ink">{row.client}</Link>
                    </td>
                    <td className="py-3 pr-4">
                      <Link href={`/jobs/${row.id}${backParam}`} className="block">
                        <span className="block font-medium text-ink transition-colors group-hover:text-accent-ink">{row.name}</span>
                        <span className="tabular block text-xs text-ink-muted">{row.code}</span>
                      </Link>
                    </td>
                    <td className="tabular py-3 pr-4 text-ink-muted">{formatSydneyDate(row.enquiredAt)}</td>
                    <td className="py-3 pr-4">
                      {row.nextTask ? (
                        <>
                          <span className="block text-ink">{row.nextTask}</span>
                          {row.nextStage ? <span className="block text-xs text-ink-muted">{stageLabel(row.nextStage)}</span> : null}
                        </>
                      ) : (
                        <span className="text-ink-muted">No pending task</span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <StatusPicker projectId={row.id} current={row.label} labels={labels} csrf={csrf} canEdit={canEdit} />
                    </td>
                    <td className="py-3">
                      <JobRowMenu jobId={row.id} clientId={row.clientId} backParam={backParam} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  )
}
