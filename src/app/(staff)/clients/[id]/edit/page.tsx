import type { Metadata } from 'next'
import { BackLink } from '@/components/BackLink'
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { AppShell } from '../../../AppShell'
import { PageContainer } from '@/components/PageContainer'
import { updateClientAction } from '../../actions'
import { ClientForm } from '../../ClientForm'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Edit client - Moments' }

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole('/clients/[id]/edit')
  const { id } = await params
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  const client = await prisma.client.findUnique({
    where: { id },
    select: {
      id: true,
      type: true,
      displayName: true,
      legalName: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      street: true,
      suburb: true,
      state: true,
      postcode: true,
      country: true,
      notes: true,
    },
  })
  if (!client) notFound()

  return (
    <AppShell user={user} csrf={csrf} active="clients" bareHeader>
      <PageContainer variant="narrow">
        <BackLink href={`/clients/${client.id}`} label="Back" />
        <h1 className="mt-3 text-2xl font-semibold text-ink">Edit {client.displayName}</h1>
        <ClientForm
          action={updateClientAction}
          csrf={csrf}
          clientId={client.id}
          submitLabel="Save changes"
          values={{
            firstName: client.firstName,
            lastName: client.lastName,
            company: client.legalName,
            email: client.email,
            phone: client.phone,
            street: client.street,
            suburb: client.suburb,
            state: client.state,
            postcode: client.postcode,
            country: client.country,
            notes: client.notes,
            isCompany: client.type === 'BUSINESS',
          }}
        />
      </PageContainer>
    </AppShell>
  )
}
