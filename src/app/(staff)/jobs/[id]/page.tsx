import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { CaseDetail } from './CaseDetail'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Job - Moments' }

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ back?: string }>
}) {
  const user = await requireRole('/jobs/[id]')
  const { id } = await params
  const { back } = await searchParams
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''
  return <CaseDetail id={id} user={user} csrf={csrf} section="jobs" back={back} />
}
