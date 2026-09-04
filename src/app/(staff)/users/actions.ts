'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { getSessionUser } from '@/lib/auth/guard'
import { hashPassword } from '@/lib/auth/password'
import { revokeAllSessions } from '@/lib/auth/session'
import { generateTempPassword, nextStaffLoginId } from '@/lib/auth/staff'
import { prisma } from '@/lib/db'
import { requireCompany } from '@/lib/domain/project'

async function requireAdmin() {
  const user = await getSessionUser()
  if (!user || user.role !== 'ADMIN') return null
  return user
}

export type AddStaffState =
  | { status: 'idle' }
  | { status: 'error'; message?: string; errors?: { name?: string } }
  | { status: 'created'; name: string; staffLoginId: string; tempPassword: string }

const addStaffSchema = z.object({
  name: z.string().trim().min(1, 'Enter the staff member’s name').max(150, 'Name is too long'),
  role: z.enum(['ADMIN', 'STUDIO', 'EDITOR']),
})

export async function addStaffAction(_prev: AddStaffState, formData: FormData): Promise<AddStaffState> {
  const cookieStore = await cookies()
  if (!verifyCsrf(cookieStore.get(CSRF_COOKIE)?.value, formData.get('csrf'))) {
    return { status: 'error', message: 'Your session expired. Refresh and try again.' }
  }
  const admin = await requireAdmin()
  if (!admin) return { status: 'error', message: 'Only an admin can add staff.' }

  const parsed = addStaffSchema.safeParse({ name: formData.get('name'), role: formData.get('role') })
  if (!parsed.success) {
    return { status: 'error', errors: { name: parsed.error.flatten().fieldErrors.name?.[0] } }
  }

  const staffLoginId = await nextStaffLoginId()
  const tempPassword = generateTempPassword()
  const hashed = await hashPassword(tempPassword)

  await prisma.$transaction(async (tx) => {
    const company = await requireCompany(tx)
    const created = await tx.user.create({
      data: {
        companyId: company.id,
        email: staffLoginId,
        name: parsed.data.name,
        passwordHash: hashed.hash,
        passwordAlgo: hashed.algo,
        role: parsed.data.role,
        isActive: true,
        status: 'ACTIVE',
        mustChangePassword: true,
      },
    })
    await tx.auditLog.create({
      data: {
        companyId: company.id,
        action: 'auth.staff_created',
        entityType: 'User',
        entityId: created.id,
        afterData: { staffLoginId, name: created.name, role: created.role },
      },
    })
  })

  revalidatePath('/users')

  return { status: 'created', name: parsed.data.name, staffLoginId, tempPassword }
}

export type ResetState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'reset'; staffLoginId: string; tempPassword: string }

export async function resetStaffPasswordAction(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const cookieStore = await cookies()
  if (!verifyCsrf(cookieStore.get(CSRF_COOKIE)?.value, formData.get('csrf'))) {
    return { status: 'error', message: 'Session expired — refresh the page.' }
  }
  const admin = await requireAdmin()
  if (!admin) return { status: 'error', message: 'Only an admin can reset passwords.' }

  const userId = String(formData.get('userId') ?? '')
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } })
  if (!target) return { status: 'error', message: 'That account no longer exists.' }

  const tempPassword = generateTempPassword()
  const hashed = await hashPassword(tempPassword)
  await prisma.user.update({
    where: { id: target.id },
    data: { passwordHash: hashed.hash, passwordAlgo: hashed.algo, mustChangePassword: true, failedAttempts: 0, lockedUntil: null },
  })
  await revokeAllSessions(target.id)
  revalidatePath('/users')
  return { status: 'reset', staffLoginId: target.email, tempPassword }
}

export async function setStaffActiveAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!verifyCsrf(cookieStore.get(CSRF_COOKIE)?.value, formData.get('csrf'))) return
  const admin = await requireAdmin()
  if (!admin) return

  const userId = String(formData.get('userId') ?? '')
  const active = String(formData.get('active') ?? '') === 'true'
  if (!userId || (userId === admin.id && !active)) return

  await prisma.user.update({ where: { id: userId }, data: { isActive: active } })
  if (!active) await revokeAllSessions(userId)
  revalidatePath('/users')
}
