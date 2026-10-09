import type { Metadata } from 'next'
import { Breadcrumb, DASHBOARD_CRUMB } from '@/components/Breadcrumb'
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { LEAD_WHERE } from '@/lib/domain/enquiry'
import { formatSydneyDate } from '@/lib/time'
import { AppShell } from '../../AppShell'
import { PageContainer } from '@/components/PageContainer'
import { ClientDetail, type EnquiryDetailData } from './ClientDetail'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Client - Moments' }

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ back?: string }>
}) {
  const user = await requireRole('/clients/[id]')
  const { id } = await params
  // The list passes its own query string as ?back so this page can return to the exact filtered list.
  const { back } = await searchParams
  const backHref = back ? `/clients?${back}` : '/clients'
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  const client = await prisma.client.findUnique({
    where: { id },
    select: {
      id: true,
      clientNumber: true,
      displayName: true,
      status: true,
      source: true,
      email: true,
      phone: true,
      street: true,
      suburb: true,
      state: true,
      postcode: true,
      country: true,
      partnerName: true,
      preferredContact: true,
      createdAt: true,
      archivedAt: true,
    },
  })
  if (!client) notFound()

  // The website Contact-Us submission for this client. A client may enquire more than once (a repeat
  // booking), so we show the most recent lead's answers here; the rest open from "Open lead".
  const enquiryWhere = { ...LEAD_WHERE, OR: [{ clientId: id }, { convertedClientId: id }, { email: client.email }] }
  const [enquiry, enquiryCount] = await Promise.all([
    prisma.enquiry.findFirst({
      where: enquiryWhere,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        eventDate: true,
        coverage: true,
        gettingReadyLocation: true,
        ceremonyLocation: true,
        weddingDetails: true,
        styleReason: true,
        heardAbout: true,
        message: true,
      },
    }),
    prisma.enquiry.count({ where: enquiryWhere }),
  ])

  const addressLine = [client.street, [client.suburb, client.state, client.postcode].filter(Boolean).join(' '), client.country]
    .filter((part) => part && part.trim() !== '')
    .join(', ')

  const enquiryData: EnquiryDetailData | null = enquiry
    ? {
        id: enquiry.id,
        eventDateISO: enquiry.eventDate ? enquiry.eventDate.toISOString().slice(0, 10) : '',
        eventDateLabel: enquiry.eventDate ? formatSydneyDate(enquiry.eventDate) : '',
        coverage: enquiry.coverage,
        gettingReadyLocation: enquiry.gettingReadyLocation,
        ceremonyLocation: enquiry.ceremonyLocation,
        weddingDetails: enquiry.weddingDetails,
        styleReason: enquiry.styleReason,
        heardAbout: enquiry.heardAbout,
        message: enquiry.message,
      }
    : null

  return (
    <AppShell user={user} csrf={csrf} active="clients" bareHeader>
      <PageContainer variant="wide">
        <Breadcrumb items={[DASHBOARD_CRUMB, { label: 'Clients', href: backHref }, { label: client.displayName }]} />
        <ClientDetail
          client={{
            id: client.id,
            clientNumber: client.clientNumber,
            displayName: client.displayName,
            email: client.email,
            phone: client.phone,
            partnerName: client.partnerName,
            preferredContact: client.preferredContact,
            source: client.source,
            status: client.status,
            addressLine,
            createdLabel: formatSydneyDate(client.createdAt),
            archived: client.archivedAt != null,
          }}
          enquiry={enquiryData}
          enquiryCount={enquiryCount}
          csrf={csrf}
          canDelete={user.role === 'ADMIN'}
        />
      </PageContainer>
    </AppShell>
  )
}
