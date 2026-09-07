import type { Metadata } from 'next'
import Image from 'next/image'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Alert } from '@/components/ui/Alert'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { getSessionUser } from '@/lib/auth/guard'
import { LoginForm } from './LoginForm'

export const runtime = 'nodejs'

export const metadata: Metadata = { title: 'Sign in - Moments' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string; error?: string }>
}) {
  const user = await getSessionUser()
  if (user) redirect('/dashboard')

  const { reset, error } = await searchParams
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  return (
    <main className="login-scene">
      <div className="login-bg">
        <Image
          src="/login/background.jpg"
          alt="White tulips resting on timber decking amid dark foliage"
          fill
          priority
          sizes="100vw"
        />
      </div>
      <div className="login-scrim" />

      <div className="login-corner login-corner-tl">
        The real
        <br />
        The raw
        <br />
        The joyful
        <div className="login-corner-rule" />
      </div>

      <div className="login-corner login-corner-bl">
        <div className="login-corner-rule" />
        Real stories
        <br />
        Honest moments
      </div>

      <div className="login-stack">
        <div className="login-brand">
          <Image
            src="/login/wordmark-light.png"
            alt="Moments"
            width={655}
            height={148}
            priority
            className="login-wordmark"
          />
          <div className="login-brand-line">Photography &amp; Film</div>
          <div className="login-brand-city">Sydney</div>
        </div>

        <div className="login-card">
          <h1 className="login-title">Access your workspace</h1>
          <p className="login-subtitle">Sign in to your account</p>

          {reset === 'done' ? (
            <div className="mt-4">
              <Alert tone="success" title="Your password has been updated">
                Sign in with your new password.
              </Alert>
            </div>
          ) : null}
          {error === 'google' ? (
            <div className="mt-4">
              <Alert tone="danger" title="Couldn’t sign in with Google">
                Please sign in with your email and password.
              </Alert>
            </div>
          ) : null}

          <LoginForm csrf={csrf} />
        </div>
      </div>
    </main>
  )
}
