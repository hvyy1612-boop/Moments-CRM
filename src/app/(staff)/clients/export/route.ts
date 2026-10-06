import { Prisma, type ClientSource, type ClientType } from '@prisma/client'
import { requireRole } from '@/lib/auth/guard'
import { csvCell } from '@/lib/csv'
import { prisma } from '@/lib/db'
import { titleCase } from '@/lib/text'
import { formatSydneyDate } from '@/lib/time'

export const runtime = 'nodejs'

const SOURCES: ClientSource[] = ['ENQUIRY', 'REFERRAL', 'MANUAL', 'OTHER']
const TYPES: ClientType[] = ['INDIVIDUAL', 'BUSINESS']

/** Download the current (filtered) client list as a CSV. Mirrors the list's own filters. */
export async function GET(request: Request): Promise<Response> {
  await requireRole('/clients/export')
  const params = new URL(request.url).searchParams
  const q = (params.get('q') ?? '').trim()
  const source = params.get('source') ?? ''
  const type = params.get('type') ?? ''
  const jobs = params.get('jobs') ?? ''

  // Mirrors the list's Active / Archived tab.
  const where: Prisma.ClientWhereInput = { archivedAt: params.get('tab') === 'archived' ? { not: null } : null }
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
    orderBy: { createdAt: 'desc' },
    select: { displayName: true, email: true, phone: true, type: true, source: true, createdAt: true, _count: { select: { projects: true } } },
  })
  const rows = jobs === '2plus' ? clients.filter((c) => c._count.projects >= 2) : clients

  const lines = [['Name', 'Email', 'Phone', 'Type', 'Source', 'Jobs', 'Client since'].join(',')]
  for (const c of rows) {
    lines.push(
      [
        c.displayName,
        c.email,
        c.phone ?? '',
        c.type === 'BUSINESS' ? 'Company' : 'Individual',
        titleCase(c.source),
        String(c._count.projects),
        formatSydneyDate(c.createdAt),
      ]
        .map((v) => csvCell(String(v)))
        .join(','),
    )
  }
  // Leading BOM so Excel opens UTF-8 correctly.
  const csv = `﻿${lines.join('\r\n')}`
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="clients-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
