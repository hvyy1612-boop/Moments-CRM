import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { can } from '@/lib/auth/authz'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { resolveLabel } from '@/features/projects/labels'
import { CLOSED_STATUSES } from '@/features/projects/lifecycle'
import { PROJECT_STAGES } from '@/features/projects/workflow'
import { getCompanyStatusLabels } from '@/lib/domain/status-labels'
import { AppShell } from '../AppShell'
import { PageContainer } from '@/components/PageContainer'
import { JobsTable, type JobRow } from './JobsTable'
import { JobSortSelect, JOB_DEFAULT_SORT, type JobSortValue } from './JobSortSelect'
import { JobFilterMenu } from './JobFilterMenu'
import { AddJobButton } from './AddJobButton'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Jobs - Moments' }

const SORTS: JobSortValue[] = ['newest', 'oldest', 'stage', 'client-asc']

// Reading order of the workflow stages, so "Sort by stage" clusters the pipeline Planning -> Delivery.
const STAGE_RANK = new Map(PROJECT_STAGES.map((s, i) => [s.key, i]))
const stageRank = (key: string | null) => (key && STAGE_RANK.has(key) ? STAGE_RANK.get(key)! : PROJECT_STAGES.length)

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

  let rows: JobRow[] = projects.map((p) => {
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
  else if (sort === 'stage') rows = [...rows].sort((a, b) => stageRank(a.nextStage) - stageRank(b.nextStage) || b.enquiredAt.getTime() - a.enquiredAt.getTime())

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
      <PageContainer variant="standard">
        <div className="text-xs font-semibold uppercase tracking-widest text-muted">Studio</div>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-md">
            <h1 className="text-3xl font-semibold text-ink">Jobs</h1>
            <p className="mt-1 text-sm text-ink-muted">Booked work from planning through the shoot, editing and delivery.</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Search moved into the table's own active-search field (client-side, live). */}
            {canEdit ? <AddJobButton csrf={csrf} /> : null}
          </div>
        </div>

        <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-2">
          <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Job status">
            {([['active', 'Active', activeCount], ['completed', 'Completed', completedCount]] as const).map(([key, label, count]) => {
              const on = tab === key
              return (
                <Link
                  key={key}
                  href={tabHref(key)}
                  role="tab"
                  aria-selected={on}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${on ? 'bg-sunk font-medium text-ink' : 'text-ink-muted hover:bg-paper hover:text-ink'}`}
                >
                  {label}
                  <span className={`tabular rounded-full px-1.5 py-0.5 text-xs leading-none ${on ? 'bg-line text-ink-muted' : 'bg-sunk text-ink-muted'}`}>{count}</span>
                </Link>
              )
            })}
          </div>
          <div className="flex items-center gap-1">
            <JobFilterMenu task={task} />
            <JobSortSelect value={sort} />
          </div>
        </div>

        {/* Table (mt-4 so the active search sits below the toolbar with the same gap as Enquiries). */}
        <div className="mt-4">
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
            <JobsTable rows={rows} backParam={backParam} labels={labels} csrf={csrf} canEdit={canEdit} />
          )}
        </div>
      </PageContainer>
    </AppShell>
  )
}
