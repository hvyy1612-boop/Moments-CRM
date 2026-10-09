import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { can } from '@/lib/auth/authz'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { CLOSED_STATUSES } from '@/features/projects/lifecycle'
import { buildProjectBoard, PROJECT_STAGES, type ProjectFacts, type TaskInput } from '@/features/projects/workflow'
import { jobShootDate, resolveTaskDueDate } from '@/lib/domain/deadline'
import { JOB_WHERE } from '@/lib/domain/project'
import { formatSydneyDate, sydneyYmd } from '@/lib/time'
import { AppShell } from '../AppShell'
import { PageContainer } from '@/components/PageContainer'
import { PageHeader } from '@/components/PageHeader'
import { DASHBOARD_CRUMB } from '@/components/Breadcrumb'
import { JobsTable, type JobRow } from './JobsTable'
import { JobSortSelect, JOB_DEFAULT_SORT, type JobSortValue } from './JobSortSelect'
import { JobFilterMenu } from './JobFilterMenu'
import { AddJobButton } from './AddJobButton'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Jobs - Moments' }

const SORTS: JobSortValue[] = ['newest', 'oldest', 'stage', 'client-asc']
// System milestones never affect the list's stage or progress (both are manual-task only).
const NO_FACTS: ProjectFacts = { finalPaid: false }

// Reading order of the workflow stages, so "Sort by stage" clusters the pipeline Planning -> Delivery.
const STAGE_RANK = new Map(PROJECT_STAGES.map((s, i) => [s.key, i]))
const stageRank = (key: string | null) => (key && STAGE_RANK.has(key) ? STAGE_RANK.get(key)! : PROJECT_STAGES.length)

/** Whole-day difference (due - now) in the studio's Sydney calendar, for the deadline alert. */
function daysUntilSydney(due: Date, now: Date): number {
  const a = sydneyYmd(due)
  const b = sydneyYmd(now)
  return Math.round((Date.UTC(a.year, a.month - 1, a.day) - Date.UTC(b.year, b.month - 1, b.day)) / 86400000)
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string; task?: string; tab?: string }>
}) {
  const user = await requireRole('/jobs')
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  const sp = await searchParams
  const q = (sp.q ?? '').trim()
  const sort: JobSortValue = SORTS.includes(sp.sort as JobSortValue) ? (sp.sort as JobSortValue) : JOB_DEFAULT_SORT
  const task = sp.task ?? ''
  const tab: 'active' | 'completed' = sp.tab === 'completed' ? 'completed' : 'active'

  const projects = await prisma.project.findMany({
      // Jobs = CONFIRMED bookings (deposit paid, or Add job). A lead's booking file (quote accepted, deposit
      // not paid) is still a lead and is not listed here (JOB_WHERE). The active/closed split is below.
      where: JOB_WHERE,
      orderBy: { enquiryReceivedAt: 'desc' },
      include: {
        client: { select: { id: true, displayName: true } },
        // All staff tasks (non-AUTO, non-cancelled): the next pending one AND whether the checklist is
        // fully done, which drives the "Complete" tag below (leaving Active is a separate, lifecycle call).
        workItems: {
          where: { type: { not: 'AUTO' }, status: { not: 'CANCELLED' } },
          orderBy: { order: 'asc' },
          select: {
            id: true, title: true, kind: true, order: true, type: true, stage: true, status: true,
            dueAt: true, dueOverrideAt: true, dueAnchor: true, dueOffsetDays: true, dueDateFixed: true,
          },
        },
        // The lead's event date: the job's shoot date until staff set one on the Shoot task.
        convertedFromEnquiries: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { eventDate: true },
        },
      },
    })
  const canEdit = can(user, 'PROJECT_EDIT')

  const now = new Date()
  let rows: JobRow[] = projects.map((p) => {
    // Stage, progress and the next task come from the SAME board the job page shows (buildProjectBoard
    // over resolved due dates), so the list can never disagree with the job: add-on and custom stages
    // never claim the stage, custom stages never count toward progress, anchored tasks get their dates.
    const shootAt = jobShootDate(p.workItems, p.convertedFromEnquiries[0]?.eventDate)
    const ctx = { shootDate: shootAt, jobConfirmedAt: p.confirmedByClientAt }
    const tasks: TaskInput[] = p.workItems.map((w) => ({
      id: w.id, title: w.title, status: w.status, stage: w.stage, type: w.type, kind: w.kind,
      resolvedDueAt: resolveTaskDueDate(w, ctx), dueAnchor: w.dueAnchor, order: w.order,
      completedByName: null, completedAt: null,
    }))
    const board = buildProjectBoard(NO_FACTS, tasks, formatSydneyDate, now, (d) => daysUntilSydney(d, now))
    const total = board.stages.filter((s) => !s.custom).reduce((n, s) => n + s.total, 0) // money-ok: task count
    const checklistDone = total > 0 && board.allDone
    const nextId = board.nextAction?.kind === 'task' ? board.nextAction.taskId : null
    const nextDue = nextId ? (tasks.find((t) => t.id === nextId)?.resolvedDueAt ?? null) : null
    const cancelled = p.lifecycleStatus === 'CANCELLED'

    // Progress % is DERIVED from real task completion (the board's own figure) - never hard-coded per
    // stage; null when the job has no tasks yet (rendered gracefully).
    const pct = total > 0 ? board.progressPercent : null


    // Deadline alert (server now, Sydney day granularity): next pending task overdue/due-soon, OR an
    // imminent shoot. Overdue task = red; task due <=2d or shoot in <=2d = amber. The most urgent wins.
    let alert: JobRow['alert'] = null
    let alertLabel: string | null = null
    if (!cancelled && !checklistDone) {
      let taskKind: 'red' | 'amber' | null = null
      let taskLabel: string | null = null
      let taskDays = Infinity
      if (nextDue) {
        const d = daysUntilSydney(nextDue, now)
        taskDays = d
        if (d < 0) { taskKind = 'red'; taskLabel = `Task overdue by ${-d} day${-d === 1 ? '' : 's'}` }
        else if (d <= 2) { taskKind = 'amber'; taskLabel = d === 0 ? 'Task due today' : `Task due in ${d} day${d === 1 ? '' : 's'}` }
      }
      let shootDays = Infinity
      let shootLabel: string | null = null
      if (shootAt) {
        const s = daysUntilSydney(shootAt, now)
        if (s >= 0 && s <= 2) { shootDays = s; shootLabel = s === 0 ? 'Shoot today' : `Shoot in ${s} day${s === 1 ? '' : 's'}` }
      }
      if (taskKind === 'red') { alert = 'red'; alertLabel = taskLabel }
      else if (taskKind === 'amber' || shootLabel) {
        alert = 'amber'
        alertLabel = shootLabel && shootDays <= taskDays ? shootLabel : (taskLabel ?? shootLabel)
      }
    }

    return {
      id: p.id,
      code: p.code,
      name: p.name,
      client: p.client.displayName,
      clientId: p.client.id,
      // Closed grouping is decided by the operational lifecycle (docs/24 Increment 1).
      closed: CLOSED_STATUSES.has(p.lifecycleStatus),
      cancelled,
      completed: checklistDone,
      stageKey: board.currentPhaseKey,
      pct,
      shootAt,
      enquiredAt: p.enquiryReceivedAt,
      alert,
      alertLabel,
    }
  })

  // Search + next-task filter first, then the Active/Completed tab split.
  if (q) {
    const needle = q.toLowerCase()
    rows = rows.filter((r) => [r.client, r.name, r.code].some((f) => f.toLowerCase().includes(needle)))
  }
  if (task === 'has') rows = rows.filter((r) => r.pct != null && !r.completed)
  if (task === 'none') rows = rows.filter((r) => r.pct == null || r.completed)

  // Active = still being worked on; Completed = the job has finished (or otherwise left the pipeline).
  // Nothing is deleted - a finished job just moves to the Completed tab, always reachable on the UI.
  const activeCount = rows.filter((r) => !r.closed).length
  const completedCount = rows.filter((r) => r.closed).length
  rows = rows.filter((r) => (tab === 'completed' ? r.closed : !r.closed))

  if (sort === 'oldest') rows = [...rows].sort((a, b) => a.enquiredAt.getTime() - b.enquiredAt.getTime())
  else if (sort === 'client-asc') rows = [...rows].sort((a, b) => a.client.localeCompare(b.client))
  else if (sort === 'stage') rows = [...rows].sort((a, b) => stageRank(a.stageKey) - stageRank(b.stageKey) || b.enquiredAt.getTime() - a.enquiredAt.getTime())

  // Deadline-critical jobs float to the top so staff never miss them. Stable sort keeps the chosen order
  // (newest / stage / ...) within each urgency level; overdue above due-soon above the rest.
  const alertRank = (a: JobRow['alert']) => (a === 'red' ? 0 : a === 'amber' ? 1 : 2)
  rows = [...rows].sort((a, b) => alertRank(a.alert) - alertRank(b.alert))

  // Carried to the job detail as ?back so its in-app "Jobs" link returns to this exact filtered list.
  const listQs = new URLSearchParams()
  if (q) listQs.set('q', q)
  if (sort !== JOB_DEFAULT_SORT) listQs.set('sort', sort)
  if (task) listQs.set('task', task)
  if (tab === 'completed') listQs.set('tab', tab)
  const listQsStr = listQs.toString()
  const backParam = listQsStr ? `?back=${encodeURIComponent(listQsStr)}` : ''

  // Tab links preserve the other params (search/sort/filter) and just flip Active <-> Completed.
  const tabHref = (t: 'active' | 'completed') => {
    const p = new URLSearchParams()
    if (q) p.set('q', q)
    if (sort !== JOB_DEFAULT_SORT) p.set('sort', sort)
    if (task) p.set('task', task)
    if (t === 'completed') p.set('tab', t)
    const qs = p.toString()
    return qs ? `/jobs?${qs}` : '/jobs'
  }

  return (
    <AppShell user={user} csrf={csrf} active="jobs" bareHeader>
      <PageContainer variant="full">
        <PageHeader
          breadcrumb={[DASHBOARD_CRUMB, { label: 'Jobs' }]}
          title="Jobs"
          actions={canEdit ? <AddJobButton csrf={csrf} /> : null}
        />

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-2">
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
            <JobsTable rows={rows} backParam={backParam} />
          )}
        </div>
      </PageContainer>
    </AppShell>
  )
}
