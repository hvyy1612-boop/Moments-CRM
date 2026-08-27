import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { can } from '@/lib/auth/authz'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { formatSydneyDate } from '@/lib/time'
import { isClosedLabel, resolveLabel, type StatusLabel } from '@/features/projects/labels'
import { stageLabel } from '@/features/projects/workflow'
import { getCompanyStatusLabels } from '@/lib/domain/status-labels'
import { StatusPicker } from '@/features/projects/components/StatusPicker'
import { AppShell } from '../AppShell'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Jobs - Moments' }

// Status colours and labels are company-defined (features/projects/labels.ts); the lifecycle enum
// still drives grouping and automation while the label controls how each status reads.

type Row = {
  id: string
  code: string
  name: string
  client: string
  label: StatusLabel
  closed: boolean
  enquiredAt: Date
  nextTask: string | null
  nextStage: string | null
}

function Group({
  title,
  spine,
  rows,
  labels,
  csrf,
  canEdit,
}: {
  title: string
  spine: string
  rows: Row[]
  labels: StatusLabel[]
  csrf: string
  canEdit: boolean
}) {
  if (rows.length === 0) return null
  return (
    <div className="mb-5">
      <div className="mb-1.5 flex items-center gap-2 text-sm font-bold text-ink">
        <span className="text-muted">▾</span>
        {title}
        <span className="font-normal text-muted">· {rows.length}</span>
      </div>
      <div className={`overflow-x-auto rounded-md border border-line border-l-4 ${spine}`}>
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-sunk text-left text-xs uppercase tracking-wide text-muted">
              <th className="w-10 border-b border-r border-line px-3 py-2.5" />
              <th className="border-b border-r border-line px-3 py-2.5 font-bold">Client</th>
              <th className="border-b border-r border-line px-3 py-2.5 font-bold">Job</th>
              <th className="border-b border-r border-line px-3 py-2.5 font-bold">Enquired</th>
              <th className="border-b border-r border-line px-3 py-2.5 font-bold">Next task</th>
              <th className="w-40 border-b border-line px-3 py-2.5 font-bold">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="group transition-colors hover:bg-paper">
                <td className="border-b border-r border-line px-3 py-2.5 text-center">
                  <span className="inline-block h-4 w-4 rounded-sm border border-line-strong align-middle" />
                </td>
                <td className="border-b border-r border-line px-3 py-2.5">
                  <Link
                    href={`/jobs/${row.id}`}
                    className="font-serif text-base font-semibold text-ink transition-colors group-hover:text-accent-ink"
                  >
                    {row.client}
                  </Link>
                </td>
                <td className="border-b border-r border-line px-3 py-2.5 text-sm">
                  <span className="text-ink">{row.name}</span>
                  <span className="tabular text-ink-muted"> · {row.code}</span>
                </td>
                <td className="tabular border-b border-r border-line px-3 py-2.5 text-sm text-ink-muted">
                  {formatSydneyDate(row.enquiredAt)}
                </td>
                <td className="border-b border-r border-line px-3 py-2.5 text-sm">
                  {row.nextTask ? (
                    <>
                      <span className="text-ink">{row.nextTask}</span>
                      {row.nextStage ? (
                        <span className="text-ink-muted"> · {stageLabel(row.nextStage)}</span>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-muted">-</span>
                  )}
                </td>
                <td className="border-b border-line p-0">
                  <StatusPicker
                    projectId={row.id}
                    current={row.label}
                    labels={labels}
                    csrf={csrf}
                    canEdit={canEdit}
                  />
                </td>
              </tr>
            ))}
            <tr>
              <td className="px-3 py-2.5" />
              <td colSpan={5} className="px-3 py-2.5 text-sm text-muted">
                <Link href="/jobs/new" className="hover:text-accent-ink">
                  + New job
                </Link>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default async function ProjectsPage() {
  const user = await requireRole('/jobs')
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  const [projects, labels] = await Promise.all([
    prisma.project.findMany({
      orderBy: { enquiryReceivedAt: 'desc' },
      include: {
        client: { select: { displayName: true } },
        workItems: {
          where: { status: 'PENDING', type: { not: 'AUTO' } },
          orderBy: { order: 'asc' },
          take: 1,
          select: { title: true, stage: true },
        },
      },
    }),
    getCompanyStatusLabels(),
  ])

  const rows: Row[] = projects.map((p) => {
    const label = resolveLabel(p, labels)
    const next = p.workItems[0]
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      client: p.client.displayName,
      label,
      closed: isClosedLabel(label),
      enquiredAt: p.enquiryReceivedAt,
      nextTask: next?.title ?? null,
      nextStage: next?.stage ?? null,
    }
  })
  const active = rows.filter((r) => !r.closed)
  const closed = rows.filter((r) => r.closed)
  const canEdit = can(user, 'PROJECT_EDIT')

  const action = (
    <Link href="/jobs/new">
      <Button size="sm">+ New job</Button>
    </Link>
  )

  return (
    <AppShell user={user} csrf={csrf} active="jobs" action={action}>
      <p className="mb-4 text-base text-ink-muted">
        Booked jobs in production - from planning through the shoot, editing, and delivery.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded border border-line-strong px-3 py-1.5 text-sm text-ink-muted">
          Group by: status
        </span>
        <span className="rounded border border-line-strong px-3 py-1.5 text-sm text-ink-muted">
          Filter
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No jobs yet"
            description="Create your first job using the New job button above."
          />
        </div>
      ) : (
        <div className="mt-5">
          <Group title="Active jobs" spine="border-l-delivered-ink" rows={active} labels={labels} csrf={csrf} canEdit={canEdit} />
          <Group title="Closed" spine="border-l-line-strong" rows={closed} labels={labels} csrf={csrf} canEdit={canEdit} />
        </div>
      )}
    </AppShell>
  )
}
