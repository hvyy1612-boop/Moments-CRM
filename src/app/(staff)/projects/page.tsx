import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatusPill, type Tone } from '@/components/ui/StatusPill'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { formatSydneyDate } from '@/lib/time'
import { AppShell } from '../AppShell'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Projects — Moments' }

const LIFECYCLE_TONE: Record<string, Tone> = {
  ENQUIRY: 'info',
  QUALIFYING: 'info',
  QUOTING: 'info',
  AWAITING_DECISION: 'warn',
  CONFIRMED: 'good',
  IN_PRODUCTION: 'good',
  COMPLETED: 'neutral',
  CANCELLED: 'neutral',
}

function label(status: string): string {
  return status.toLowerCase().replace(/_/g, ' ')
}

export default async function ProjectsPage() {
  const user = await requireRole('/projects')
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  const projects = await prisma.project.findMany({
    orderBy: { enquiryReceivedAt: 'desc' },
    include: { client: { select: { displayName: true } } },
  })

  return (
    <AppShell user={user} csrf={csrf} active="projects">
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="text-xl">Projects</h1>
            <p className="mt-1 text-sm text-ink-muted">Every enquiry becomes a project here.</p>
          </div>
          <Link
            href="/projects/new"
            className="inline-flex items-center rounded bg-accent px-4 py-2 text-sm font-medium text-surface transition-colors duration-150 hover:brightness-95"
          >
            New enquiry
          </Link>
        </div>

        {projects.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              title="No projects yet"
              description="Log the first enquiry with the New enquiry button above."
            />
          </div>
        ) : (
          <ul className="mt-6 flex flex-col rounded border border-line bg-surface">
            {projects.map((project) => (
              <li
                key={project.id}
                className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0"
              >
                <div>
                  <Link
                    href={`/projects/${project.id}`}
                    className="text-base text-ink underline underline-offset-2 transition-colors duration-150 hover:text-accent"
                  >
                    {project.client.displayName}
                  </Link>
                  <p className="text-xs text-ink-muted">
                    {project.code} · {project.name} · enquired {formatSydneyDate(project.enquiryReceivedAt)}
                  </p>
                </div>
                <StatusPill tone={LIFECYCLE_TONE[project.lifecycleStatus] ?? 'neutral'}>
                  {label(project.lifecycleStatus)}
                </StatusPill>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  )
}
