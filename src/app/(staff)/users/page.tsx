import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { formatSydneyDate } from '@/lib/time'
import { AppShell } from '../AppShell'
import { AddStaffForm } from './AddStaffForm'
import { StaffList, type StaffRowData } from './StaffList'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Staff - Moments' }

const ROLE_LABEL: Record<string, string> = { ADMIN: 'Admin', STUDIO: 'Studio', EDITOR: 'Editor' }

/**
 * Staff account management (ADMIN only). Accounts are provisioned here - the system issues a Staff ID
 * and a one-time password; there is no public sign-up. Admins can reset a password or disable an
 * account (which revokes its sessions immediately).
 */
export default async function UsersPage() {
  const user = await requireRole('/users')
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  const users = await prisma.user.findMany({
    orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, name: true, email: true, role: true, isActive: true, lastLoginAt: true },
  })
  const staff: StaffRowData[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    loginId: u.email,
    roleLabel: ROLE_LABEL[u.role] ?? u.role,
    isActive: u.isActive,
    lastLogin: u.lastLoginAt ? `Last in ${formatSydneyDate(u.lastLoginAt)}` : 'Never signed in',
  }))

  return (
    <AppShell user={user} csrf={csrf} active="users">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-serif text-2xl font-semibold text-ink">Staff</h1>
        <p className="mt-1 text-base text-ink-muted">
          You create the accounts here. Each staff member gets a Staff ID and a one-time password, then
          sets their own password on first sign-in. There is no public sign-up.
        </p>

        <section className="mt-6 rounded-md border border-line bg-surface p-5">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Add staff</h2>
          <AddStaffForm csrf={csrf} />
        </section>

        <section className="mt-4 rounded-md border border-line bg-surface p-5">
          <h2 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Team · {staff.length}</h2>
          <StaffList staff={staff} csrf={csrf} currentUserId={user.id} />
        </section>
      </div>
    </AppShell>
  )
}
