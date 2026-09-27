import type { Metadata } from 'next'
import { Breadcrumb, DASHBOARD_CRUMB } from '@/components/Breadcrumb'
import { cookies } from 'next/headers'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { AppShell } from '../../AppShell'
import { PageContainer } from '@/components/PageContainer'
import { createClientAction } from '../actions'
import { ClientForm } from '../ClientForm'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Add client - Moments' }

export default async function NewClientPage() {
  const user = await requireRole('/clients/new')
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  return (
    <AppShell user={user} csrf={csrf} active="clients" bareHeader>
      <PageContainer variant="narrow">
        <Breadcrumb items={[DASHBOARD_CRUMB, { label: 'Clients', href: '/clients' }, { label: 'New client' }]} />
        <h1 className="mt-3 text-xl font-semibold text-ink">Add a client</h1>
        <p className="mt-1 text-base text-ink-muted">
          Record the client and their enquiry. This opens a lead in Enquiries with a workflow you can
          work through, and becomes a job once you convert it.
        </p>
        <ClientForm action={createClientAction} csrf={csrf} submitLabel="Add client" showEnquiryFields />
      </PageContainer>
    </AppShell>
  )
}
