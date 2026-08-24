import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { Button } from '@/components/ui/Button'
import { Field, Select, TextInput, Textarea } from '@/components/ui/form'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { AppShell } from '../../AppShell'
import { logEnquiryAction } from '../actions'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Log enquiry — Moments' }

const SOURCES = [
  { value: 'WEBSITE', label: 'Website' },
  { value: 'REFERRAL', label: 'Referral' },
  { value: 'INSTAGRAM', label: 'Instagram' },
  { value: 'MANUAL', label: 'Manual' },
  { value: 'OTHER', label: 'Other' },
]

export default async function NewEnquiryPage() {
  const user = await requireRole('/enquiries')
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  return (
    <AppShell user={user} csrf={csrf} active="enquiries">
      <div className="mx-auto max-w-2xl">
        <Link href="/enquiries" className="text-sm font-bold text-accent-ink hover:underline">
          Back to enquiries
        </Link>

        <h1 className="mt-3 font-serif text-2xl font-semibold text-ink">Log an enquiry</h1>
        <p className="mt-1 text-base text-ink-muted">
          Record a new lead. You can convert it into a project once you have spoken with them.
        </p>

        <form action={logEnquiryAction} className="mt-6 rounded-md border border-line bg-surface p-6">
          <input type="hidden" name="csrf" value={csrf} />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Name" htmlFor="name" required>
              <TextInput id="name" name="name" required maxLength={120} placeholder="Sarah Nguyen" />
            </Field>
            <Field label="Email" htmlFor="email" required>
              <TextInput id="email" name="email" type="email" required maxLength={254} placeholder="sarah@email.com" />
            </Field>
            <Field label="Phone" htmlFor="phone">
              <TextInput id="phone" name="phone" maxLength={40} placeholder="0412 345 678" />
            </Field>
            <Field label="Event type" htmlFor="eventType">
              <TextInput id="eventType" name="eventType" maxLength={80} placeholder="Wedding" />
            </Field>
            <Field label="Event date" htmlFor="eventDate">
              <TextInput id="eventDate" name="eventDate" type="date" />
            </Field>
            <Field label="Source" htmlFor="source">
              <Select id="source" name="source" defaultValue="MANUAL">
                {SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="mt-5">
            <Field label="Message" htmlFor="message">
              <Textarea id="message" name="message" maxLength={2000} placeholder="What are they looking for?" />
            </Field>
          </div>
          <div className="mt-6 flex items-center gap-3">
            <Button type="submit">Log enquiry</Button>
            <Link href="/enquiries" className="text-base text-ink-muted hover:text-ink">
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </AppShell>
  )
}
