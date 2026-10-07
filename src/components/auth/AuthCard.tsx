import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'

/**
 * The shared shell for the account pages (sign-up, forgot password, set a new password), ProtonMail-style:
 * the studio wordmark small at the top-left of the page and ONE centred card that grows with its content.
 * The title lives inside the card ({@link AuthTitle}) so a form can change it as it moves through steps.
 * /login keeps its own editorial scene.
 */
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

/** The card's bold, left-aligned title with an optional grey subtitle. */
export function AuthTitle({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <div className="mb-7">
      <h1 className="auth-title">{title}</h1>
      {subtitle ? <p className="auth-subtitle">{subtitle}</p> : null}
    </div>
  )
}
