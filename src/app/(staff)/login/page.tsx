import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Alert } from '@/components/ui/Alert'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { getSessionUser } from '@/lib/auth/guard'
import { signupOptions } from '@/lib/auth/register'
import { LoginForm } from './LoginForm'

export const runtime = 'nodejs'

export const metadata: Metadata = { title: 'Sign in - Moments' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string; codes?: string }>
}) {
  const user = await getSessionUser()
  if (user) redirect('/dashboard')

  const { reset, codes } = await searchParams
  const { open: signupOpen } = await signupOptions()
  const codesLeft = codes !== undefined && /^\d$/.test(codes) ? Number(codes) : null
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

      <div className="login-corner login-corner-br">
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
                {codesLeft !== null
                  ? ` You have ${codesLeft} recovery code${codesLeft === 1 ? '' : 's'} left${codesLeft <= 2 ? ': create a new set from Change password after you sign in.' : '.'}`
                  : null}
              </Alert>
            </div>
          ) : null}

          <LoginForm csrf={csrf} />
          {signupOpen ? (
            <p className="login-signup">
              New to Moments? <Link href="/register" className="login-link">Create an account</Link>
            </p>
          ) : null}
        </div>
      </div>
    </main>
  )
}
