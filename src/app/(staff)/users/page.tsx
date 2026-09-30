import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { TEAMS } from '@/lib/auth/teams'
import { prisma } from '@/lib/db'
import { formatSydneyDate } from '@/lib/time'
import { PageHeader } from '@/components/PageHeader'
import { DASHBOARD_CRUMB } from '@/components/Breadcrumb'
import { AppShell } from '../AppShell'
import { PageContainer } from '@/components/PageContainer'
import { AddStaffForm } from './AddStaffForm'
import { StaffTeams, type StaffRowData, type TeamGroup } from './StaffTeams'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Staff - Moments' }

const ROLE_LABEL: Record<string, string> = { ADMIN: 'Admin', STUDIO: 'Studio', EDITOR: 'Editor' }

export default async function UsersPage() {
  const user = await requireRole('/users')
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  const users = await prisma.user.findMany({
    where: { NOT: { OR: [{ status: 'DELETED' }, { email: { endsWith: '@example.invalid' } }] } },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    select: { id: true, name: true, email: true, role: true, isActive: true, lastLoginAt: true },
  })

  const toRow = (u: (typeof users)[number]): StaffRowData => ({
    id: u.id,
    name: u.name,
    loginId: u.email,
    roleLabel: ROLE_LABEL[u.role] ?? u.role,
    isActive: u.isActive,
    lastLogin: u.lastLoginAt ? `Last in ${formatSydneyDate(u.lastLoginAt)}` : 'Never signed in',
  })

  const teams: TeamGroup[] = TEAMS.map((t) => {
    const members = users.filter((u) => u.role === t.role).map(toRow)
    return { slug: t.slug, label: t.label, activeCount: members.filter((m) => m.isActive).length, members }
  }).filter((t) => t.members.length > 0)

  const totalActive = teams.reduce((n, t) => n + t.activeCount, 0)

  return (
    <AppShell user={user} csrf={csrf} active="users">
      <PageContainer variant="full">
        <PageHeader
          breadcrumb={[DASHBOARD_CRUMB, { label: 'Users' }]}
          title="Users"
        />

        <section className="rounded-md border border-line bg-surface p-5">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Add staff</h2>
          <AddStaffForm csrf={csrf} />
        </section>

        <div className="mt-6 mb-1 flex items-center justify-between">
          <h2 className="font-serif text-lg font-semibold text-ink">Teams</h2>
          <span className="text-sm text-ink-muted">{totalActive} active</span>
        </div>
        <p className="mb-3 text-sm text-ink-muted">
          <span className="font-semibold text-ink">Reset password</span> gives a new one-time password ·{' '}
          <span className="font-semibold text-ink">Disable</span> blocks sign-in but keeps the account ·{' '}
          <span className="font-semibold text-ink">Remove</span> deletes the account and revokes access
        </p>
        <StaffTeams teams={teams} csrf={csrf} currentUserId={user.id} />
      </PageContainer>
    </AppShell>
  )
}
