import type { Metadata } from 'next'
import { BackLink } from '@/components/BackLink'
import { cookies } from 'next/headers'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { AppShell } from '../../AppShell'
import { ImportForm } from '../ImportForm'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Import clients - Moments' }

export default async function ImportClientsPage() {
  const user = await requireRole('/clients/import')
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  return (
    <AppShell user={user} csrf={csrf} active="clients" bareHeader>
      <div className="w-full">
        <BackLink href="/clients" label="Clients" />
        <h1 className="mt-3 text-3xl font-semibold text-ink">Import clients</h1>
        <p className="mt-1 text-sm text-ink-muted">Bulk-add client profiles from a CSV. This creates profiles only. It does not open enquiries.</p>
        <div className="mt-6">
          <ImportForm csrf={csrf} />
        </div>
      </div>
    </AppShell>
  )
}
