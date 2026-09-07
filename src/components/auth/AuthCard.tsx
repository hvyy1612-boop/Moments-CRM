import Image from 'next/image'
import type { ReactNode } from 'react'

/**
 * The shared shell for the sign-in and register pages: a centred card carrying the studio wordmark
 * (the reference "Moments" calligraphy artwork, not a font), the "Photography and Film" line, a small
 * intro heading, and the page's content (form, Google button, links). Both auth pages use it so the
 * two screens stay visually identical (§8.5).
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
      <div className="w-full max-w-md rounded-xl border border-line bg-surface p-8 shadow-sm">
        <div className="text-center">
          <Image
            src="/auth/wordmark.png"
            alt="Moments"
            width={720}
            height={188}
            priority
            className="auth-wordmark"
          />
          <p className="mt-2 text-xs uppercase tracking-[0.28em] text-muted">Photography and Film</p>
        </div>
        <h1 className="mt-6 text-center text-base font-normal text-ink-muted">{heading}</h1>
        {subtitle ? <p className="mt-2 text-center text-sm text-ink-muted">{subtitle}</p> : null}
        <div className="mt-6 flex flex-col gap-5">{children}</div>
      </div>
    </main>
  )
}
