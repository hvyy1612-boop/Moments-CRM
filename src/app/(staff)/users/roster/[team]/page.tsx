import type { Metadata } from 'next'
import { BackLink } from '@/components/BackLink'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { teamBySlug } from '@/lib/auth/teams'
import { PrintButton } from '@/components/PrintButton'
import { StaffRosterDoc, type RosterRow } from '@/components/StaffRosterDoc'
import { prisma } from '@/lib/db'
import { formatSydneyDate } from '@/lib/time'
import { AppShell } from '../../../AppShell'
import { PageContainer } from '@/components/PageContainer'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Staff roster - Moments' }

const ROLE_NAME: Record<string, string> = { ADMIN: 'Admin', STUDIO: 'Studio', EDITOR: 'Editor' }

export default async function StaffRosterPage({ params }: { params: Promise<{ team: string }> }) {
  const user = await requireRole('/users/roster/[team]')
  const { team } = await params
  const teamDef = teamBySlug(team)
  if (!teamDef) notFound()

  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  const [company, users] = await Promise.all([
    prisma.company.findFirst({ select: { name: true } }),
    prisma.user.findMany({
      where: {
        role: teamDef.role,
        isActive: true,
        NOT: { OR: [{ status: 'DELETED' }, { email: { endsWith: '@example.invalid' } }] },
      },
      orderBy: [{ name: 'asc' }],
      select: { name: true, email: true, role: true, lastLoginAt: true },
    }),
  ])

  const rows: RosterRow[] = users.map((u) => ({
    name: u.name,
    loginId: u.email,
    roleLabel: ROLE_NAME[u.role] ?? u.role,
    lastLogin: u.lastLoginAt ? formatSydneyDate(u.lastLoginAt) : 'Never signed in',
  }))

  const doc = (
    <StaffRosterDoc
      companyName={company?.name ?? 'Moments'}
      teamLabel={teamDef.label}
      generatedBy={user.name}
      generatedAt={formatSydneyDate(new Date())}
      rows={rows}
    />
  )

  return (
    <>
      <div className="print:hidden">
        <AppShell user={user} csrf={csrf} active="users">
          <PageContainer variant="narrow">
            <BackLink href="/users" label="Users" />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <h1 className="font-serif text-2xl font-semibold text-ink">{teamDef.label} roster</h1>
              <PrintButton label="Download PDF" />
            </div>
            <p className="mt-1 text-sm text-ink-muted">
              Active accounts only. Use your browser&rsquo;s &ldquo;Save as PDF&rdquo; in the print dialog.
            </p>
            <div className="mt-5">{doc}</div>
          </PageContainer>
        </AppShell>
      </div>

      {/* Print target: only the roster sheet prints — no app chrome. */}
      <div className="hidden print:block">{doc}</div>
    </>
  )
}
