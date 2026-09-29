import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { Breadcrumb, DASHBOARD_CRUMB } from '@/components/Breadcrumb'
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { IconLink } from '@/components/ui/IconButton'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { titleCase } from '@/lib/text'
import { formatSydneyDate } from '@/lib/time'
import { AppShell } from '../../AppShell'
import { PageContainer } from '@/components/PageContainer'
import { AddEnquiryButton } from '../../leads/AddEnquiryButton'
import { DeleteClientButton } from './DeleteClientButton'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Client - Moments' }

const svg = {
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  viewBox: '0 0 24 24',
}
const IconPencil = () => (
  <svg className="h-4 w-4" {...svg}>
    <path d="M4 20h4l10-10-4-4L4 16v4z" />
    <path d="m13.5 6.5 4 4" />
  </svg>
)
const IconPerson = () => (
  <svg className="h-5 w-5" {...svg}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
  </svg>
)
const IconDoc = () => (
  <svg className="h-5 w-5" {...svg}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5M9 13h6M9 17h4" />
  </svg>
)

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p.charAt(0).toUpperCase()).join('') || '?'
}

/** A titled section: a maroon heading + icon over a hairline, then a two-column field grid. No card. */
function DocSection({ title, icon, action, children }: { title: string; icon: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-9">
      <div className="flex items-center justify-between gap-3 border-b border-line pb-2.5">
        <h2 className="flex items-center gap-2 text-base font-semibold text-accent-ink">
          <span aria-hidden="true">{icon}</span>
          {title}
        </h2>
        {action}
      </div>
      <div className="mt-6 grid grid-cols-1 gap-x-10 gap-y-5 md:grid-cols-2">{children}</div>
    </section>
  )
}

/**
 * A read-only value shown in the form field's visual language (label above a bordered box) so the page
 * reads as one clean client document. `multiline` keeps the website-form answers' line breaks. Editing
 * still happens on the Edit page; this presents the submitted information for staff to read and correct.
 */
function DocField({ label, value, required = false, multiline = false }: { label: string; value?: string | null; required?: boolean; multiline?: boolean }) {
  const has = value != null && value.trim() !== ''
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-ink">
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </label>
      <div className={`min-h-10 w-full break-words rounded border border-line-strong bg-surface px-3 py-2 text-base ${has ? 'text-ink' : 'text-muted'} ${multiline ? 'whitespace-pre-line' : ''}`}>
        {has ? value : '-'}
      </div>
    </div>
  )
}

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
      firstName: true,
      lastName: true,
      type: true,
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
    },
  })
  if (!client) notFound()

  // The website Contact-Us submission for this client. A client may enquire more than once (a repeat
  // booking), so we show the most recent enquiry's answers here; the rest open from "View enquiry".
  // Match on the clientId FK (set by Add enquiry), the converted link, or the shared email.
  const enquiryWhere = { OR: [{ clientId: id }, { convertedClientId: id }, { email: client.email }] }
  const [enquiry, enquiryCount] = await Promise.all([
    prisma.enquiry.findFirst({
      where: enquiryWhere,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        eventDate: true,
        coverage: true,
        partnerName: true,
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

  const clientName = [client.firstName, client.lastName].filter(Boolean).join(' ') || client.displayName
  const partnerName = client.partnerName ?? enquiry?.partnerName ?? null
  const addressLine = [client.street, [client.suburb, client.state, client.postcode].filter(Boolean).join(' '), client.country]
    .filter((part) => part && part.trim() !== '')
    .join(', ')

  return (
    <AppShell user={user} csrf={csrf} active="clients" bareHeader>
      <PageContainer variant="wide">
        <Breadcrumb items={[DASHBOARD_CRUMB, { label: 'Clients', href: backHref }, { label: client.displayName }]} />

        {/* Header: identity + icon-only action toolbar. */}
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-tint text-base font-semibold text-accent-ink">
              {initials(client.displayName)}
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold leading-tight text-ink">{client.displayName}</h1>
              <p className="mt-0.5 truncate text-sm text-ink-muted">
                {client.clientNumber ? <span className="tabular text-ink-muted">{client.clientNumber} · </span> : null}
                <a href={`mailto:${client.email}`} className="hover:text-ink">{client.email}</a>
                {client.phone ? ` · ${client.phone}` : ''}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <AddEnquiryButton csrf={csrf} clientId={client.id} clientName={client.displayName} trigger="icon" />
            <IconLink label="Edit" tone="accent" href={`/clients/${client.id}/edit`} icon={<IconPencil />} />
            {user.role === 'ADMIN' ? (
              <DeleteClientButton clientId={client.id} name={client.displayName} csrf={csrf} />
            ) : null}
          </div>
        </div>

        {/* Client details */}
        <DocSection title="Client details" icon={<IconPerson />}>
          <DocField label="Client name" value={clientName} required />
          <DocField label="Partner name" value={partnerName} />
          <DocField label="Email" value={client.email} required />
          <DocField label="Mobile" value={client.phone} required />
          <DocField label="Wedding / Event date" value={enquiry?.eventDate ? formatSydneyDate(enquiry.eventDate) : null} />
          <DocField label="Photography or Videography or Both?" value={enquiry?.coverage} />
          <DocField label="Address / Suburb" value={addressLine} />
          <DocField label="Preferred contact" value={client.preferredContact} />
          <DocField label="Source" value={titleCase(client.source)} />
          <DocField label="Status" value={titleCase(client.status)} />
          <DocField label="Client since" value={formatSydneyDate(client.createdAt)} />
        </DocSection>

        {/* Enquiry details - the answers submitted through the website Contact-Us form. */}
        <DocSection
          title="Enquiry details"
          icon={<IconDoc />}
          action={
            enquiry ? (
              <Link href={`/leads/${enquiry.id}`} className="text-sm font-medium text-accent-ink hover:underline">
                {enquiryCount > 1 ? `Open lead (${enquiryCount})` : 'Open lead'}
              </Link>
            ) : null
          }
        >
          {enquiry ? (
            <>
              <DocField label="Where is your 'getting-ready' location?" value={enquiry.gettingReadyLocation} required multiline />
              <DocField label="Where is your ceremony and reception location?" value={enquiry.ceremonyLocation} required multiline />
              <DocField label="Wedding day details / guest numbers" value={enquiry.weddingDetails} required multiline />
              <DocField label="What draws you to our photography / videography style?" value={enquiry.styleReason} required multiline />
              <DocField label="How did you hear about us?" value={enquiry.heardAbout} />
              <DocField label="Additional notes" value={enquiry.message} multiline />
            </>
          ) : (
            <p className="text-base text-ink-muted md:col-span-2">No enquiry on file yet. Use the Add lead action above to record one for this client.</p>
          )}
        </DocSection>
      </PageContainer>
    </AppShell>
  )
}
