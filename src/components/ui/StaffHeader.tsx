import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import type { SessionUser } from '@/lib/auth/guard'
import { signOut } from '@/app/(staff)/dashboard/actions'

export function StaffHeader({ user, csrf }: { user: SessionUser; csrf: string }) {
  const canSeeEnquiries = user.role === 'ADMIN' || user.role === 'STUDIO'

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-baseline gap-6">
          <Link href="/dashboard" className="text-base font-medium text-ink">
            Moments
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/dashboard" className="text-ink-muted transition-colors duration-150 hover:text-ink">
              Dashboard
            </Link>
            {canSeeEnquiries ? (
              <>
                <Link
                  href="/enquiries"
                  className="text-ink-muted transition-colors duration-150 hover:text-ink"
                >
                  Enquiries
                </Link>
                <Link
                  href="/bookings"
                  className="text-ink-muted transition-colors duration-150 hover:text-ink"
                >
                  Bookings
                </Link>
              </>
            ) : null}
            <Link
              href="/outbox"
              className="text-ink-muted transition-colors duration-150 hover:text-ink"
            >
              Outbox
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-ink-muted">
            {user.name} · {user.role}
          </span>
          <form action={signOut}>
            <input type="hidden" name="csrf" value={csrf} />
            <Button type="submit" variant="secondary" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </div>
    </header>
  )
}
