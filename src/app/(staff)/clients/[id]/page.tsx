import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { StatusTag } from '@/components/ui/StatusTag'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { titleCase } from '@/lib/text'
import { formatSydneyDate } from '@/lib/time'
import { statusKind, statusLabel } from '@/features/projects/lifecycle'
import { AppShell } from '../../AppShell'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Client — Moments' }

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-t border-line py-2.5 first:border-t-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-right text-base text-ink">{value}</span>
    </div>
  )
}

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole('/clients/[id]')
  const { id } = await params
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  const client = await prisma.client.findUnique({
    where: { id },
    select: {
      id: true,
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
      notes: true,
      createdAt: true,
      projects: {
        orderBy: { enquiryReceivedAt: 'desc' },
        select: { id: true, code: true, name: true, lifecycleStatus: true },
      },
    },
  })
  if (!client) notFound()

  // Address lines, skipping the parts that are blank.
  const cityLine = [client.suburb, client.state, client.postcode].filter(Boolean).join(' ')
  const addressLines = [client.street, cityLine, client.country].filter(Boolean)

  return (
    <AppShell user={user} csrf={csrf} active="clients">
      <div className="mx-auto max-w-3xl">
        <Link href="/clients" className="text-sm font-bold text-accent-ink hover:underline">
          Back to clients
        </Link>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="font-serif text-3xl font-semibold text-ink">{client.displayName}</h1>
          <span className="rounded border border-line-strong px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-ink-muted">
            {client.type === 'BUSINESS' ? 'Company' : 'Individual'}
          </span>
          <span className="rounded border border-line-strong px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-ink-muted">
            {titleCase(client.status)}
          </span>
        </div>
        <p className="mt-1 text-base text-ink-muted">
          Client since {formatSydneyDate(client.createdAt)} · {titleCase(client.source)}
        </p>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-md border border-line bg-surface p-5">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Contact</h2>
            <DetailRow label="First name" value={client.firstName ?? '-'} />
            <DetailRow label="Last name" value={client.lastName ?? '-'} />
            <DetailRow label="Email" value={client.email} />
            <DetailRow label="Phone" value={client.phone ?? '-'} />
          </div>

          <div className="rounded-md border border-line bg-surface p-5">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Address</h2>
            {addressLines.length > 0 ? (
              <div className="space-y-1 text-base text-ink">
                {addressLines.map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
            ) : (
              <p className="text-base text-ink-muted">No address on file.</p>
            )}
          </div>
        </div>

        {client.notes ? (
          <div className="mt-4 rounded-md border border-line bg-surface p-5">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Notes</h2>
            <p className="whitespace-pre-line text-base text-ink">{client.notes}</p>
          </div>
        ) : null}

        <div className="mt-4 rounded-md border border-line bg-surface p-5">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">
            Projects · {client.projects.length}
          </h2>
          {client.projects.length === 0 ? (
            <p className="text-base text-ink-muted">No projects yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {client.projects.map((p) => (
                <Link
                  key={p.id}
                  href={`/projects/${p.id}`}
                  className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2.5 transition-colors hover:bg-paper"
                >
                  <span className="text-base text-ink">
                    <span className="font-serif font-semibold">{p.name}</span>
                    <span className="tabular text-ink-muted"> · {p.code}</span>
                  </span>
                  <StatusTag kind={statusKind(p.lifecycleStatus)} solid>
                    {statusLabel(p.lifecycleStatus)}
                  </StatusTag>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
