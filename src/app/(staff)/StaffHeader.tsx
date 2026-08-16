import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import type { SessionUser } from '@/lib/auth/guard'
import { signOut } from './actions'

/** Staff navigation shell. Slice 1 has a single destination (Projects); more land as slices do. */
export function StaffHeader({ user, csrf }: { user: SessionUser; csrf: string }) {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-baseline gap-6">
          <Link href="/projects" className="text-base font-medium text-ink">
            Moments
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/projects" className="font-medium text-ink">
              Projects
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
