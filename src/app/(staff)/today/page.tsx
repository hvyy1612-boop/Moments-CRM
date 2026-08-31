import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { getTodayCockpit, type TaskLine } from '@/lib/domain/today'
import { AppShell } from '../AppShell'
import { markTaskDoneAction } from './actions'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Today - Moments' }

function TaskRow({ line, csrf }: { line: TaskLine; csrf: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-line py-2.5 last:border-b-0">
      <form action={markTaskDoneAction}>
        <input type="hidden" name="csrf" value={csrf} />
        <input type="hidden" name="taskId" value={line.id} />
        <button
          type="submit"
          title="Mark done"
          aria-label={`Mark "${line.title}" done`}
          className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-line-strong text-transparent hover:border-accent hover:text-accent"
        >
          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
        </button>
      </form>
      <span className={`h-2 w-2 shrink-0 rounded-full ${line.category === 'lead' ? 'bg-enquiry-ink' : 'bg-accent'}`} />
      <Link href={line.href} className="min-w-0 flex-1">
        <span className="block truncate text-sm text-ink">{line.title}</span>
        <span className="block truncate text-xs text-ink-muted">{line.client}</span>
      </Link>
      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${line.overdue ? 'bg-lost text-lost-ink' : 'bg-sunk text-ink-muted'}`}>{line.dueLabel}</span>
    </div>
  )
}

function Card({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="rounded-md border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="font-serif text-lg font-semibold text-ink">{title}</h2>
        {count !== undefined ? <span className="rounded-full bg-sunk px-2.5 py-0.5 text-xs font-bold text-ink-muted">{count}</span> : null}
      </div>
      <div className="px-4 py-2">{children}</div>
    </section>
  )
}

const EMPTY = <p className="py-4 text-center text-sm text-ink-muted">Nothing to do - you're all caught up.</p>

export default async function TodayPage() {
  const user = await requireRole('/today')
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''
  const c = await getTodayCockpit()

  const needAction = [...c.overdue, ...c.todayTasks]

  return (
    <AppShell user={user} csrf={csrf} active="today">
      <div className="mb-5">
        <h1 className="font-serif text-2xl font-semibold text-ink">Today</h1>
        <p className="text-sm text-ink-muted">{c.dateLabel} - the studio's morning dashboard.</p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
          <span className="rounded-full bg-lost px-3 py-1 text-lost-ink">{c.counts.overdue} overdue</span>
          <span className="rounded-full bg-accent-tint px-3 py-1 text-accent-ink">{c.counts.today} today</span>
          <span className="rounded-full bg-sunk px-3 py-1 text-ink-muted">{c.counts.shoots} shoot</span>
          <span className="rounded-full bg-sunk px-3 py-1 text-ink-muted">{c.counts.waiting} waiting</span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="lg:col-span-2">
          <Card title="Needs action" count={needAction.length}>
            {needAction.length === 0 ? EMPTY : needAction.map((l) => <TaskRow key={l.id} line={l} csrf={csrf} />)}
          </Card>
        </div>

        <Card title="Shoots today" count={c.counts.shoots}>
          {c.shootsToday.length === 0 ? (
            <p className="py-4 text-center text-sm text-ink-muted">No shoots today.</p>
          ) : (
            c.shootsToday.map((s) => (
              <Link key={s.id} href={s.href} className="flex items-center gap-3 border-b border-line py-2.5 last:border-b-0">
                <span className="shrink-0 rounded bg-accent-tint px-2 py-0.5 text-xs font-bold text-accent-ink">{s.timeLabel}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm text-ink">{s.client}</span><span className="block truncate text-xs text-ink-muted">{s.title}</span></span>
              </Link>
            ))
          )}
        </Card>

        <Card title="Clients waiting on you" count={c.counts.waiting}>
          {c.waitingLeads.length === 0 ? (
            <p className="py-4 text-center text-sm text-ink-muted">No clients waiting on your reply.</p>
          ) : (
            c.waitingLeads.map((w) => (
              <Link key={w.id} href={w.href} className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-b-0">
                <span className="min-w-0 truncate text-sm text-ink">{w.name}</span>
                <span className="shrink-0 text-xs text-ink-muted">since {w.sinceLabel}</span>
              </Link>
            ))
          )}
        </Card>

        <div className="lg:col-span-2">
          <Card title="Upcoming (7 days)" count={c.upcoming.length}>
            {c.upcoming.length === 0 ? EMPTY : c.upcoming.map((l) => <TaskRow key={l.id} line={l} csrf={csrf} />)}
          </Card>
        </div>
      </div>
    </AppShell>
  )
}
