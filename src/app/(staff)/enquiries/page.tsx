import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatusTag } from '@/components/ui/StatusTag'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import {
  ENQUIRY_EMPTY,
  ENQUIRY_STAGE_KIND,
  ENQUIRY_STAGE_LABEL,
  ENQUIRY_VIEWS,
  isOpenEnquiry,
} from '@/features/enquiries/status'
import { currentActionText } from '@/features/enquiries/workflow'
import { AppShell } from '../AppShell'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Enquiries - Moments' }

const DAY_MS = 86_400_000

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/[_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function snippet(value: string, max = 70): string {
  const clean = value.trim().replace(/\s+/g, ' ')
  return clean.length > max ? `${clean.slice(0, max)}...` : clean
}

type Row = {
  id: string
  name: string
  event: string
  status: string
  waitingOn: string | null
  waitingDays: number
  currentTask: string | null
  latestWho: 'Client' | 'You' | null
  latestText: string | null
}

export default async function EnquiriesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>
}) {
  const user = await requireRole('/enquiries')
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  const requested = (await searchParams).view
  const activeView = ENQUIRY_VIEWS.find((v) => v.key === requested) ?? ENQUIRY_VIEWS[0]!

  const enquiries = await prisma.enquiry.findMany({
    orderBy: { updatedAt: 'asc' }, // oldest-waiting first, so the most overdue rises to the top
    select: {
      id: true,
      name: true,
      eventType: true,
      status: true,
      waitingOn: true,
      updatedAt: true,
      workItems: {
        where: { status: 'PENDING' },
        orderBy: { order: 'asc' },
        take: 1,
        select: { title: true },
      },
      communications: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { direction: true, body: true },
      },
    },
  })

  const now = Date.now()
  const rows: Row[] = enquiries.map((e) => {
    const last = e.communications[0]
    return {
      id: e.id,
      name: e.name,
      event: e.eventType ? titleCase(e.eventType) : 'Enquiry',
      status: e.status,
      waitingOn: e.waitingOn,
      waitingDays: Math.max(0, Math.floor((now - e.updatedAt.getTime()) / DAY_MS)),
      currentTask: e.workItems[0]?.title ?? null,
      latestWho: last ? (last.direction === 'inbound' ? 'Client' : 'You') : null,
      latestText: last?.body ?? null,
    }
  })

  const shown = rows.filter((r) => activeView.match(r.status, r.waitingOn))
  const empty = ENQUIRY_EMPTY[activeView.key] ?? ENQUIRY_EMPTY.all!

  const action = (
    <Link href="/enquiries/new">
      <Button size="sm">+ Log enquiry</Button>
    </Link>
  )

  return (
    <AppShell user={user} csrf={csrf} active="enquiries" action={action}>
      <p className="mb-4 text-base text-ink-muted">Who needs attention from you today.</p>

      <div className="flex flex-wrap items-center gap-2">
        {ENQUIRY_VIEWS.map((v) => {
          const count = rows.filter((r) => v.match(r.status, r.waitingOn)).length
          const isActive = v.key === activeView.key
          return (
            <Link
              key={v.key}
              href={v.key === 'attention' ? '/enquiries' : `/enquiries?view=${v.key}`}
              className={`rounded border px-3 py-1.5 text-sm transition-colors ${
                isActive
                  ? 'border-ink bg-ink font-bold text-surface'
                  : 'border-line-strong text-ink-muted hover:text-ink'
              }`}
            >
              {v.label}
              <span className={isActive ? 'text-surface/70' : 'text-muted'}> · {count}</span>
            </Link>
          )
        })}
      </div>

      {shown.length === 0 ? (
        <div className="mt-6">
          <EmptyState title={empty.title} description={empty.description} />
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-2">
          {shown.map((row) => (
            <Link
              key={row.id}
              href={`/enquiries/${row.id}`}
              className="group block rounded-md border border-line bg-surface px-4 py-3 transition-colors hover:border-line-strong hover:bg-paper"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-serif text-lg font-semibold text-ink transition-colors group-hover:text-accent-ink">
                      {row.name}
                    </span>
                    <span className="shrink-0 text-sm text-ink-muted">· {row.event}</span>
                  </div>
                  {row.latestText ? (
                    <div className="mt-0.5 truncate text-sm text-ink-muted">
                      <span className="font-semibold text-ink">{row.latestWho}:</span>{' '}
                      {snippet(row.latestText)}
                    </div>
                  ) : (
                    <div className="mt-0.5 text-sm text-muted">No messages yet</div>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-4">
                  <div className="hidden text-right sm:block">
                    <div className="text-sm">
                      {row.waitingOn === 'STUDIO' ? (
                        <span className="font-bold text-accent-ink">You</span>
                      ) : row.waitingOn === 'CLIENT' ? (
                        <span className="text-ink-muted">Client</span>
                      ) : (
                        <span className="text-muted">Closed</span>
                      )}
                      {isOpenEnquiry(row.status) && row.waitingDays > 0 ? (
                        <span className="tabular text-muted"> · {row.waitingDays}d</span>
                      ) : null}
                    </div>
                    <div className="text-sm text-ink-muted">
                      {currentActionText(row.waitingOn, row.currentTask)}
                    </div>
                  </div>
                  <div className="w-36 text-right">
                    <StatusTag kind={ENQUIRY_STAGE_KIND[row.status] ?? 'hold'}>
                      {ENQUIRY_STAGE_LABEL[row.status] ?? titleCase(row.status)}
                    </StatusTag>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  )
}
