import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { Button } from '@/components/ui/Button'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { formatSydneyDate } from '@/lib/time'
import { AppShell } from '../AppShell'
import { approveUserAction, rejectUserAction } from './actions'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Users - Moments' }

const ROLE_LABEL: Record<string, string> = { ADMIN: 'Admin', STUDIO: 'Studio', EDITOR: 'Editor' }

export default async function UsersPage() {
  const user = await requireRole('/users')
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, email: true, role: true, status: true, createdAt: true, lastLoginAt: true },
  })
  const pending = users.filter((u) => u.status === 'PENDING')
  const active = users.filter((u) => u.status === 'ACTIVE')
  const rejected = users.filter((u) => u.status === 'REJECTED')

  return (
    <AppShell user={user} csrf={csrf} active="users">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-serif text-2xl font-semibold text-ink">Users</h1>
        <p className="mt-1 text-base text-ink-muted">
          Anyone can register; new accounts wait here until you approve them.
        </p>

        {/* Pending approval */}
        <section className="mt-6 rounded-md border border-line bg-surface p-5">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">
            Waiting for approval · {pending.length}
          </h2>
          {pending.length === 0 ? (
            <p className="text-base text-ink-muted">No accounts are waiting.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {pending.map((u) => (
                <div key={u.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line px-4 py-3">
                  <div className="min-w-0">
                    <div className="font-serif text-lg font-semibold text-ink">{u.name}</div>
                    <div className="text-sm text-ink-muted">
                      {u.email} · registered {formatSydneyDate(u.createdAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <form action={approveUserAction} className="flex items-center gap-2">
                      <input type="hidden" name="csrf" value={csrf} />
                      <input type="hidden" name="userId" value={u.id} />
                      <select
                        name="role"
                        defaultValue="STUDIO"
                        aria-label="Role"
                        className="h-9 rounded border border-line-strong bg-surface px-2 text-sm text-ink"
                      >
                        <option value="STUDIO">Studio</option>
                        <option value="ADMIN">Admin</option>
                        <option value="EDITOR">Editor</option>
                      </select>
                      <Button size="sm" type="submit">
                        Approve
                      </Button>
                    </form>
                    <form action={rejectUserAction}>
                      <input type="hidden" name="csrf" value={csrf} />
                      <input type="hidden" name="userId" value={u.id} />
                      <button
                        type="submit"
                        className="rounded border border-line-strong px-3 py-1.5 text-sm font-bold text-lost-ink hover:underline"
                      >
                        Reject
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Active team */}
        <section className="mt-4 rounded-md border border-line bg-surface p-5">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Team · {active.length}</h2>
          <div className="flex flex-col">
            {active.map((u) => (
              <div key={u.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-2.5 first:border-t-0">
                <div className="min-w-0">
                  <span className="text-base text-ink">{u.name}</span>
                  <span className="text-sm text-ink-muted"> · {u.email}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-ink-muted">
                  <span className="rounded border border-line-strong px-2 py-0.5 text-xs font-bold uppercase tracking-wide">
                    {ROLE_LABEL[u.role] ?? u.role}
                  </span>
                  <span className="tabular">
                    {u.lastLoginAt ? `Last in ${formatSydneyDate(u.lastLoginAt)}` : 'Never signed in'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {rejected.length > 0 ? (
          <section className="mt-4 rounded-md border border-line bg-surface p-5">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Rejected · {rejected.length}</h2>
            <div className="flex flex-col gap-1">
              {rejected.map((u) => (
                <div key={u.id} className="text-sm text-ink-muted">
                  {u.name} · {u.email}
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </AppShell>
  )
}
