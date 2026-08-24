import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { can } from '@/lib/auth/authz'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { ResetLinkGenerator } from '@/features/settings/components/ResetLinkGenerator'
import { AppShell } from '../AppShell'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Settings — Moments' }

const SECTIONS: { title: string; items: string[] }[] = [
  { title: 'Company', items: ['Company details', 'Logo', 'Currency & tax (GST)', 'Date & time'] },
  { title: 'Finance', items: ['Invoice settings', 'Payment schedules', 'Payment methods'] },
  { title: 'Templates', items: ['Packages', 'Email templates', 'Quote & contract', 'Questionnaire', 'Workflow templates'] },
  { title: 'Labels & status', items: ['Project statuses', 'Enquiry statuses', 'Invoice statuses'] },
  { title: 'Account', items: ['Users', 'Notifications', 'Density'] },
]

export default async function SettingsPage() {
  const user = await requireRole('/settings')
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  return (
    <AppShell user={user} csrf={csrf} active="settings">
      {can(user, 'USER_MANAGE') ? (
        <div className="mb-4">
          <ResetLinkGenerator csrf={csrf} />
        </div>
      ) : null}

      <p className="mb-5 text-base text-ink-muted">
        These sections are placeholders for now. The controls arrive as each area is built out.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((section) => (
          <div key={section.title} className="rounded-md border border-line bg-surface p-5">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">{section.title}</h2>
            {section.items.map((item) => (
              <div key={item} className="border-t border-line py-2.5 text-base text-ink-muted first:border-t-0">
                {item}
              </div>
            ))}
          </div>
        ))}
      </div>
    </AppShell>
  )
}
