import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { Prisma, type ClientSource, type ClientType } from '@prisma/client'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { formatSydneyDate } from '@/lib/time'
import { titleCase } from '@/lib/text'
import { AppShell } from '../AppShell'
import { ClientRowMenu } from './ClientRowMenu'
import { SortSelect, DEFAULT_SORT, type SortValue } from './SortSelect'
import { FilterMenu } from './FilterMenu'
import { ColumnsMenu } from './ColumnsMenu'
import { ClientsMoreMenu } from './ClientsMoreMenu'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Clients - Moments' }

const SORTS: SortValue[] = ['newest', 'oldest', 'name-asc', 'name-desc', 'most-jobs', 'fewest-jobs']
const SOURCES: ClientSource[] = ['DIRECT_BOOKING', 'ENQUIRY', 'REFERRAL', 'MANUAL', 'OTHER']
const TYPES: ClientType[] = ['INDIVIDUAL', 'BUSINESS']

function orderFor(sort: SortValue): Prisma.ClientOrderByWithRelationInput {
  switch (sort) {
    case 'oldest': return { createdAt: 'asc' }
    case 'name-asc': return { displayName: 'asc' }
    case 'name-desc': return { displayName: 'desc' }
    case 'most-jobs': return { projects: { _count: 'desc' } }
    case 'fewest-jobs': return { projects: { _count: 'asc' } }
    default: return { createdAt: 'desc' }
  }
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string; source?: string; type?: string; jobs?: string }>
}) {
  const user = await requireRole('/clients')
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  const sp = await searchParams
  const q = (sp.q ?? '').trim()
  const sort: SortValue = SORTS.includes(sp.sort as SortValue) ? (sp.sort as SortValue) : DEFAULT_SORT
  const source = sp.source ?? ''
  const type = sp.type ?? ''
  const jobs = sp.jobs ?? ''

  const where: Prisma.ClientWhereInput = { mergedIntoClientId: null, archivedAt: null }
  if (q) {
    where.OR = [
      { displayName: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
      { phone: { contains: q } },
    ]
  }
  if ((SOURCES as string[]).includes(source)) where.source = source as ClientSource
  if ((TYPES as string[]).includes(type)) where.type = type as ClientType
  if (jobs === 'none') where.projects = { none: {} }
  if (jobs === 'has' || jobs === '2plus') where.projects = { some: {} }

  const clients = await prisma.client.findMany({
    where,
    orderBy: orderFor(sort),
    select: {
      id: true,
      displayName: true,
      email: true,
      phone: true,
      source: true,
      createdAt: true,
      _count: { select: { projects: true } },
    },
  })

  const allRows = clients.map((c) => ({
    id: c.id,
    name: c.displayName,
    email: c.email,
    phone: c.phone,
    source: titleCase(c.source),
    projects: c._count.projects,
    since: c.createdAt,
  }))

  const rows = jobs === '2plus' ? allRows.filter((r) => r.projects >= 2) : allRows

  const listQs = new URLSearchParams()
  if (q) listQs.set('q', q)
  if (sort !== DEFAULT_SORT) listQs.set('sort', sort)
  if (source) listQs.set('source', source)
  if (type) listQs.set('type', type)
  if (jobs) listQs.set('jobs', jobs)
  const listQsStr = listQs.toString()
  const backParam = listQsStr ? `?back=${encodeURIComponent(listQsStr)}` : ''
  const exportHref = `/clients/export${listQsStr ? `?${listQsStr}` : ''}`

  return (
    <AppShell user={user} csrf={csrf} active="clients" bareHeader>
      <div className="w-full">
        {/* Header */}
        <div className="text-xs text-muted">Studio / Clients</div>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-ink">Clients</h1>
            <p className="mt-1 text-sm text-ink-muted">Manage client profiles and contact information.</p>
          </div>
          <div className="flex items-center gap-2">
            <form method="get" className="relative">
              {sort !== DEFAULT_SORT ? <input type="hidden" name="sort" value={sort} /> : null}
              <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
              </svg>
              <input
                name="q"
                defaultValue={q}
                placeholder="Search clients"
                aria-label="Search clients"
                className="h-9 w-64 rounded-md border border-line bg-surface pl-9 pr-3 text-sm text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-accent focus:ring-1 focus:ring-accent"
              />
            </form>
            <Link
              href="/clients/new"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-sunk"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add client
            </Link>
          </div>
        </div>

        {/* Toolbar */}
        <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-2">
          <div className="text-sm text-ink">
            All clients <span className="text-ink-muted">· {rows.length}</span>
          </div>
          <div className="flex items-center gap-1">
            <FilterMenu source={source} type={type} jobs={jobs} />
            <SortSelect value={sort} />
            <ColumnsMenu />
            <ClientsMoreMenu exportHref={exportHref} />
          </div>
        </div>

        {/* Table */}
        {rows.length === 0 ? (
          <p className="py-16 text-center text-sm text-ink-muted">
            {q ? `No clients match "${q}".` : 'No clients yet. Add your first client above, or convert an enquiry.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="clients-table w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-4 font-medium">Client</th>
                  <th data-col="phone" className="py-2 pr-4 font-medium">Phone</th>
                  <th data-col="source" className="py-2 pr-4 font-medium">Source</th>
                  <th data-col="jobs" className="py-2 pr-4 font-medium">Jobs</th>
                  <th data-col="since" className="py-2 pr-4 font-medium">Client since</th>
                  <th className="w-10 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="group border-b border-line transition-colors last:border-b-0 hover:bg-paper">
                    <td className="py-3 pr-4">
                      <Link href={`/clients/${row.id}${backParam}`} className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-tint text-xs font-semibold text-accent-ink">
                          {initials(row.name)}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-ink transition-colors group-hover:text-accent-ink">{row.name}</span>
                          <span className="block truncate text-xs text-ink-muted">{row.email}</span>
                        </span>
                      </Link>
                    </td>
                    <td data-col="phone" className="tabular py-3 pr-4 text-ink-muted">{row.phone ?? '-'}</td>
                    <td data-col="source" className="py-3 pr-4 text-ink-muted">{row.source}</td>
                    <td data-col="jobs" className="tabular py-3 pr-4 text-ink">{row.projects}</td>
                    <td data-col="since" className="tabular py-3 pr-4 text-ink-muted">{formatSydneyDate(row.since)}</td>
                    <td className="py-3">
                      <ClientRowMenu
                        clientId={row.id}
                        name={row.name}
                        email={row.email}
                        csrf={csrf}
                        canDelete={user.role === 'ADMIN'}
                        backParam={backParam}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  )
}
