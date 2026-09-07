import Image from 'next/image'
import type { ReactNode } from 'react'

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
            alt="Moments"
            width={655}
            height={148}
            priority
            className="auth-wordmark"
          />
          <p className="mt-2 text-xs uppercase tracking-[0.28em] text-muted">Photography &amp; Film</p>
        </div>
        <h1 className="mt-6 text-center text-base font-normal text-ink-muted">{heading}</h1>
        {subtitle ? <p className="mt-1.5 text-center text-sm text-ink-muted">{subtitle}</p> : null}
        <div className="mt-7 flex flex-col gap-4">{children}</div>
      </div>
    </main>
  )
}
