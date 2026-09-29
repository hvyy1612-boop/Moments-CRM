import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { can } from '@/lib/auth/authz'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { ResetLinkGenerator } from '@/features/settings/components/ResetLinkGenerator'
import { PageHeader } from '@/components/PageHeader'
import { DASHBOARD_CRUMB } from '@/components/Breadcrumb'
import { AppShell } from '../AppShell'
import { PageContainer } from '@/components/PageContainer'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Settings - Moments' }

type SectionItem = { label: string; href?: string }
const SECTIONS: { title: string; items: SectionItem[] }[] = [
  { title: 'Company', items: [{ label: 'Company details' }, { label: 'Logo' }, { label: 'Currency & tax (GST)' }, { label: 'Date & time' }] },
  { title: 'Finance', items: [{ label: 'Invoice settings' }, { label: 'Payment schedules' }, { label: 'Payment methods' }] },
  { title: 'Templates', items: [{ label: 'Packages' }, { label: 'Email templates' }, { label: 'Quote & contract' }, { label: 'Questionnaire' }, { label: 'Workflow templates' }] },
  { title: 'Labels & status', items: [{ label: 'Job statuses' }, { label: 'Lead stages' }, { label: 'Invoice statuses' }] },
  { title: 'Account', items: [{ label: 'Users', href: '/users' }, { label: 'Notifications', href: '/settings/notifications' }, { label: 'Density' }] },
]

export default async function SettingsPage() {
  const user = await requireRole('/settings')
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  return (
    <AppShell user={user} csrf={csrf} active="settings">
      <PageContainer variant="standard">
      <PageHeader breadcrumb={[DASHBOARD_CRUMB, { label: 'Settings' }]} title="Settings" description="Studio configuration and account tools." />
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
            {section.items.map((item) =>
              item.href ? (
                <Link
                  key={item.label}
                  href={item.href}
                  className="flex items-center justify-between border-t border-line py-2.5 text-base text-ink first:border-t-0 hover:text-accent"
                >
                  {item.label}
                  <span aria-hidden className="text-muted">&rsaquo;</span>
                </Link>
              ) : (
                <div key={item.label} className="border-t border-line py-2.5 text-base text-ink-muted first:border-t-0">
                  {item.label}
                </div>
              ),
            )}
          </div>
        ))}
      </div>
      </PageContainer>
    </AppShell>
  )
}
