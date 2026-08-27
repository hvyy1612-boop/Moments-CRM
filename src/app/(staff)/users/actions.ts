'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { getSessionUser } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'

async function requireAdmin() {
  const user = await getSessionUser()
  if (!user || user.role !== 'ADMIN') throw new Error('Not authorised.')
  return user
}

async function csrfOk(formData: FormData): Promise<boolean> {
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value
  return verifyCsrf(cookieValue, formData.get('csrf'))
}

const ROLES = new Set(['ADMIN', 'STUDIO', 'EDITOR'])

export async function approveUserAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin()
  if (!(await csrfOk(formData))) throw new Error('Invalid request.')
  const userId = String(formData.get('userId') ?? '')
  const roleRaw = String(formData.get('role') ?? 'STUDIO')
  const role = (ROLES.has(roleRaw) ? roleRaw : 'STUDIO') as 'ADMIN' | 'STUDIO' | 'EDITOR'
  if (!userId) return
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, status: true, companyId: true },
  })
  if (!target || target.status === 'ACTIVE') return
  await prisma.user.update({ where: { id: userId }, data: { isActive: true, status: 'ACTIVE', role } })
  await prisma.auditLog.create({
    data: {
      companyId: target.companyId,
      actorUserId: admin.id,
      action: 'auth.user_approved',
      entityType: 'User',
      entityId: userId,
      afterData: { role },
    },
  })
  revalidatePath('/users')
}

export async function rejectUserAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin()
  if (!(await csrfOk(formData))) throw new Error('Invalid request.')
  const userId = String(formData.get('userId') ?? '')
  if (!userId) return
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, status: true, companyId: true },
  })
  if (!target || target.status === 'ACTIVE') return
  await prisma.user.update({ where: { id: userId }, data: { isActive: false, status: 'REJECTED' } })
  await prisma.auditLog.create({
    data: {
      companyId: target.companyId,
      actorUserId: admin.id,
      action: 'auth.user_rejected',
      entityType: 'User',
      entityId: userId,
    },
  })
  revalidatePath('/users')
}
