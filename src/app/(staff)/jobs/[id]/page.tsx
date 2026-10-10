import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { isBookingFile } from '@/features/projects/lifecycle'
import { CaseDetail } from './CaseDetail'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Job - Moments' }

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ back?: string; sent?: string; tab?: string }>
}) {
  const user = await requireRole('/jobs/[id]')
  const { id } = await params
  const { back, sent, tab } = await searchParams
  const file = await prisma.project.findUnique({
    where: { id },
    select: { lifecycleStatus: true, confirmedByClientAt: true, convertedFromEnquiries: { select: { id: true }, take: 1 } },
  })
  const leadId = file?.convertedFromEnquiries[0]?.id
  if (file && leadId && isBookingFile(file)) redirect(`/leads/${leadId}`)
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''
  return <CaseDetail id={id} user={user} csrf={csrf} section="jobs" back={back} sent={sent} tab={tab} />
}
