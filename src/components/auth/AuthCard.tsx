import type { ReactNode } from 'react'

/**
 * The shared shell for the sign-in and register pages: a centred card carrying the studio wordmark,
 * a heading and an optional subtitle, then the page's content (form, Google button, links). Both auth
 * pages use it so the two screens stay visually identical (§8.5).
 */
export function AuthCard({
  heading,
  subtitle,
  children,
}: {
  heading: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-4 py-12">
      <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-8 shadow-sm">
        <div className="text-center">
          <div className="font-serif text-xl font-semibold uppercase tracking-[0.18em] text-ink">Moments</div>
          <p className="mt-1 text-xs uppercase tracking-[0.2em] text-muted">Photography · Sydney</p>
        </div>
        <h1 className="mt-6 text-center text-2xl">{heading}</h1>
        {subtitle ? <p className="mt-2 text-center text-sm text-ink-muted">{subtitle}</p> : null}
        <div className="mt-6 flex flex-col gap-5">{children}</div>
      </div>
    </main>
  )
}
