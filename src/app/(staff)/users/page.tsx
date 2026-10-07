import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { ROLE_LABEL, TEAMS } from '@/lib/auth/teams'
import { prisma } from '@/lib/db'
import { formatSydneyDate } from '@/lib/time'
import { PageHeader } from '@/components/PageHeader'
import { DASHBOARD_CRUMB } from '@/components/Breadcrumb'
import { AppShell } from '../AppShell'
import { PageContainer } from '@/components/PageContainer'
import { AddStaffForm } from './AddStaffForm'
import { signupOptions } from '@/lib/auth/register'
import { setSignupOpenAction } from './actions'
import { StaffTeams, type StaffRowData, type TeamGroup } from './StaffTeams'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Staff - Moments' }


/**
 * Staff account management (ADMIN only). Accounts are added here (the system issues a login ID and a
 * one-time password) or by people signing up at /register while sign-up is open (switch below; the Admin
 * role is never offered there once an Admin exists). Accounts are grouped by team; admins can reset a
 * password, disable (revokes sessions), or remove (soft-delete: hidden here, kept in the database). Each
 * team exports a printable roster of its active accounts (Download PDF).
 */
export default async function UsersPage() {
  const user = await requireRole('/users')
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  // Removed (soft-deleted) accounts are kept in the DB but hidden here.
  const users = await prisma.user.findMany({
    where: { status: { not: 'DELETED' } },
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
  const signup = await signupOptions()

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

        <section className="mt-4 flex flex-col gap-3 rounded-md border border-line bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wide text-muted">Staff sign-up</h2>
            <p className="mt-1 text-base text-ink">
              {signup.open ? 'Open: anyone with the link can create a Staff or Supervisor account at /register.' : 'Closed: only an admin can add accounts.'}
            </p>
          </div>
          <form action={setSignupOpenAction}>
            <input type="hidden" name="csrf" value={csrf} />
            <input type="hidden" name="open" value={signup.open ? '0' : '1'} />
            <button type="submit" className="rounded border border-line bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-paper">
              {signup.open ? 'Close sign-up' : 'Open sign-up'}
            </button>
          </form>
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
