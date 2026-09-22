import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { Prisma, type ClientSource, type ClientType } from '@prisma/client'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { titleCase } from '@/lib/text'
import { AppShell } from '../AppShell'
import { ClientsTable } from './ClientsTable'
import { SortSelect, DEFAULT_SORT, type SortValue } from './SortSelect'
import { FilterMenu } from './FilterMenu'
import { ColumnsMenu } from './ColumnsMenu'

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

  // Clients page = profile management only: hide merged and archived records from the main list.
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
  // "2+ jobs" is the one filter Prisma can't express in the where clause, so refine here.
  const rows = jobs === '2plus' ? allRows.filter((r) => r.projects >= 2) : allRows

  // Carried to the detail page as ?back so its in-app "Clients" link returns to this exact filtered list.
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
        {/* Header (shared PageHeader pattern: uppercase section eyebrow, then title + description). */}
        <div className="text-xs font-semibold uppercase tracking-widest text-muted">Studio</div>
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
            {/* Import / Export surfaced as primary buttons (were hidden in a "..." menu). Import opens the
                bulk CSV page; Export is a plain anchor so the CSV route's attachment downloads in place. */}
            <Link
              href="/clients/import"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-sunk"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3v12" /><path d="m8 11 4 4 4-4" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
              </svg>
              Import
            </Link>
            <a
              href={exportHref}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-sunk"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 15V3" /><path d="m8 7 4-4 4 4" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
              </svg>
              Export
            </a>
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
          </div>
        </div>

        {/* Table */}
        {rows.length === 0 ? (
          <p className="py-16 text-center text-sm text-ink-muted">
            {q ? `No clients match "${q}".` : 'No clients yet. Add your first client above, or convert an enquiry.'}
          </p>
        ) : (
          <ClientsTable rows={rows} csrf={csrf} canDelete={user.role === 'ADMIN'} backParam={backParam} />
        )}
      </div>
    </AppShell>
  )
}
