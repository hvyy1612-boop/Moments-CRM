import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'

export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <main className="auth-shell">
      <div className="auth-brand">
        <Link href="/login" aria-label="Moments - back to sign in" className="inline-block">
          <Image src="/auth/main-logo.png" alt="Moments" width={655} height={148} priority className="auth-wordmark" />
        </Link>
      </div>
      <div className="auth-card">{children}</div>
    </main>
  )
}

export function AuthTitle({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="auth-title">{title}</h1>
      {subtitle ? <p className="auth-subtitle">{subtitle}</p> : null}
    </div>
  )
}
