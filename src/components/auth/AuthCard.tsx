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
    <main className="auth-shell">
      <div className="auth-card">
        <div className="text-center">
          <Image
            src="/auth/main-logo.png"
            alt="Moments Photography and Film"
            width={846}
            height={292}
            priority
            className="auth-wordmark"
          />
        </div>
        <h1 className="mt-5 text-center text-base font-normal text-ink-muted">{heading}</h1>
        {subtitle ? <p className="mt-1.5 text-center text-sm text-ink-muted">{subtitle}</p> : null}
        <div className="mt-7 flex flex-col gap-4">{children}</div>
      </div>
    </main>
  )
}
