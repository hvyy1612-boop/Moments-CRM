import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { AppShell } from '../../AppShell'
import { StaffEnquiryForm } from './StaffEnquiryForm'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'New enquiry — Moments' }

export default async function NewEnquiryPage() {
  const user = await requireRole('/projects/new')
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  return (
    <AppShell user={user} csrf={csrf} active="projects">
      <div className="mx-auto w-full max-w-lg">
        <Link href="/projects" className="text-sm text-ink-muted transition-colors hover:text-accent">
          ← Projects
        </Link>
        <h1 className="mt-2 font-serif text-2xl text-ink">New enquiry</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Log an enquiry that arrived by phone, email, or the company website.
        </p>
        <StaffEnquiryForm csrf={csrf} />
      </div>
    </AppShell>
  )
}
