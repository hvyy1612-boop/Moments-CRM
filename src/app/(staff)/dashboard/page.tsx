import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { Button } from '@/components/ui/Button'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { signOut } from './actions'

export const runtime = 'nodejs'

export const metadata: Metadata = { title: 'Dashboard — Moments' }

/**
 * The staff landing page. Slice 2 proves the session end to end; the §10.4 "what needs attention
 * today" content arrives as enquiries, quotations, invoices and deliverables are built in later
 * slices, and the empty state below names exactly that.
 */
export default async function DashboardPage() {
  const user = await requireRole('/dashboard') // SEC-A01
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <header className="flex items-start justify-between gap-4 border-b border-line pb-4">
        <div>
          <p className="text-sm text-ink-muted">Moments Photography and Film</p>
          <h1 className="mt-1 text-xl">Dashboard</h1>
        </div>
        <form action={signOut}>
          <input type="hidden" name="csrf" value={csrf} />
          <Button type="submit" variant="secondary" size="sm">
            Sign out
          </Button>
        </form>
      </header>

      <p className="mt-4 text-sm text-ink-muted">
        Signed in as {user.name} · {user.role}
      </p>

      <section className="mt-8 rounded border border-line bg-surface p-6">
        <h2 className="text-lg">What needs attention today</h2>
        <p className="mt-2 text-sm text-ink-muted">
          Nothing to show yet. Overdue enquiries, quotations about to expire, unpaid invoices and
          late deliverables will appear here as those areas come online in the next slices.
        </p>
      </section>
    </main>
  )
}
