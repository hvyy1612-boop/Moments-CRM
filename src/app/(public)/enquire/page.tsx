import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { EnquiryForm } from './EnquiryForm'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Enquire - Moments' }

export default async function EnquirePage() {
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-12">
      <p className="text-sm font-medium uppercase tracking-wide text-accent">Moments Photography and Film</p>
      <h1 className="mt-2 text-2xl text-ink">Make an enquiry</h1>
      <p className="mt-2 text-ink-muted">
        Tell us a little about your day. We reply within a day.
      </p>
      <div className="mt-8">
        <EnquiryForm csrf={csrf} />
      </div>
    </main>
  )
}
