'use server'

import { Prisma } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { setSignupOpen } from '@/lib/auth/register'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { getActionUser } from '@/lib/auth/guard'
import { can } from '@/lib/auth/authz'
import { passwordCredentials, resetUserPassword } from '@/lib/auth/user-password'
import { revokeAllSessions } from '@/lib/auth/session'
import { generateTempPassword, nextStaffLoginId } from '@/lib/auth/staff'
import { prisma } from '@/lib/db'
import { requireCompany } from '@/lib/domain/project'

async function requireUserManager() {
  const user = await getActionUser()
  if (!user || !can(user, 'USER_MANAGE')) return null
  return user
}

function canActOnRole(actorRole: string, targetRole: string): boolean {
  return actorRole === 'ADMIN' || targetRole !== 'ADMIN'
}

function activeAdminCount(companyId: string) {
  return prisma.user.count({ where: { companyId, role: 'ADMIN', isActive: true, status: 'ACTIVE' } })
}

export type AddStaffState =
  | { status: 'idle' }
  | { status: 'error'; message?: string; errors?: { name?: string } }
  | { status: 'created'; name: string; staffLoginId: string; tempPassword: string }

const addStaffSchema = z.object({
  name: z.string().trim().min(1, 'Enter the staff member’s name').max(150, 'Name is too long'),
  role: z.enum(['ADMIN', 'STUDIO', 'SUPERVISOR']),
})

export async function addStaffAction(_prev: AddStaffState, formData: FormData): Promise<AddStaffState> {
  const cookieStore = await cookies()
  if (!verifyCsrf(cookieStore.get(CSRF_COOKIE)?.value, formData.get('csrf'))) {
    return { status: 'error', message: 'Your session expired. Refresh and try again.' }
  }
  const admin = await requireUserManager()
  if (!admin) return { status: 'error', message: 'You do not have access to manage accounts.' }

  const parsed = addStaffSchema.safeParse({ name: formData.get('name'), role: formData.get('role') })
  if (!parsed.success) {
    return { status: 'error', errors: { name: parsed.error.flatten().fieldErrors.name?.[0] } }
  }
  if (!canActOnRole(admin.role, parsed.data.role)) {
    return { status: 'error', message: 'Only an admin can create an admin account.' }
  }

  const tempPassword = generateTempPassword()
  const creds = await passwordCredentials(tempPassword)

  const { name, role } = parsed.data
  let staffLoginId = ''
  for (let attempt = 0; ; attempt++) {
    staffLoginId = await nextStaffLoginId(role)
    const loginId = staffLoginId
    try {
      await prisma.$transaction(async (tx) => {
        const company = await requireCompany(tx)
        const created = await tx.user.create({
          data: { companyId: company.id, email: loginId, name, ...creds, role, isActive: true, status: 'ACTIVE', mustChangePassword: true },
        })
        await tx.auditLog.create({
          data: {
            companyId: company.id,
            actorUserId: admin.id,
            action: 'auth.staff_created',
            entityType: 'User',
            entityId: created.id,
            afterData: { staffLoginId: loginId, name: created.name, role: created.role },
          },
        })
      })
      break
    } catch (e) {
      if (attempt < 3 && e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue
      throw e
    }
  }

  revalidatePath('/users')

  return { status: 'created', name, staffLoginId, tempPassword }
}

export type ResetState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'reset'; staffLoginId: string; tempPassword: string }

export async function resetStaffPasswordAction(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const cookieStore = await cookies()
  if (!verifyCsrf(cookieStore.get(CSRF_COOKIE)?.value, formData.get('csrf'))) {
    return { status: 'error', message: 'Session expired. Refresh the page.' }
  }
  const admin = await requireUserManager()
  if (!admin) return { status: 'error', message: 'You do not have access to manage accounts.' }

  const userId = String(formData.get('userId') ?? '')
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, companyId: true, email: true, name: true, role: true } })
  if (!target) return { status: 'error', message: 'That account no longer exists.' }
  if (!canActOnRole(admin.role, target.role)) return { status: 'error', message: 'Only an admin can reset an admin’s password.' }

  if (target.id === admin.id) return { status: 'error', message: 'To change your own password, use Change password instead.' }

  const tempPassword = generateTempPassword()
  await resetUserPassword(target.id, tempPassword)
  await revokeAllSessions(target.id)
  await prisma.auditLog.create({
    data: { companyId: target.companyId, actorUserId: admin.id, action: 'auth.staff_password_reset', entityType: 'User', entityId: target.id, afterData: { loginId: target.email, name: target.name } },
  })
  revalidatePath('/users')
  return { status: 'reset', staffLoginId: target.email, tempPassword }
}

export async function setStaffActiveAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!verifyCsrf(cookieStore.get(CSRF_COOKIE)?.value, formData.get('csrf'))) return
  const admin = await requireUserManager()
  if (!admin) return

  const userId = String(formData.get('userId') ?? '')
  const active = String(formData.get('active') ?? '') === 'true'
  if (!userId || (userId === admin.id && !active)) return

  const existing = await prisma.user.findUnique({ where: { id: userId }, select: { companyId: true, role: true } })
  if (!existing) return

  if (!canActOnRole(admin.role, existing.role)) return

  if (!active && existing.role === 'ADMIN' && (await activeAdminCount(existing.companyId)) <= 1) return

  const target = await prisma.user.update({ where: { id: userId }, data: { isActive: active }, select: { id: true, companyId: true, email: true, name: true } })
  if (!active) await revokeAllSessions(userId)
  await prisma.auditLog.create({
    data: {
      companyId: target.companyId, actorUserId: admin.id, action: active ? 'auth.staff_enabled' : 'auth.staff_disabled',
      entityType: 'User', entityId: target.id, afterData: { loginId: target.email, name: target.name },
    },
  })
  revalidatePath('/users')
}

export async function removeStaffAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!verifyCsrf(cookieStore.get(CSRF_COOKIE)?.value, formData.get('csrf'))) return
  const admin = await requireUserManager()
  if (!admin) return

  const userId = String(formData.get('userId') ?? '')
  if (!userId || userId === admin.id) return

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, companyId: true, email: true, name: true, role: true },
  })
  if (!target) return

  if (!canActOnRole(admin.role, target.role)) return

  if (target.role === 'ADMIN' && (await activeAdminCount(target.companyId)) <= 1) return

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: target.id }, data: { isActive: false, status: 'DELETED' } })
    await tx.auditLog.create({
      data: {
        companyId: target.companyId,
        actorUserId: admin.id,
        action: 'auth.staff_removed',
        entityType: 'User',
        entityId: target.id,
        beforeData: { loginId: target.email, name: target.name, role: target.role },
      },
    })
  })
  await revokeAllSessions(target.id)
  revalidatePath('/users')
}

export async function setSignupOpenAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!verifyCsrf(cookieStore.get(CSRF_COOKIE)?.value, formData.get('csrf'))) return
  const admin = await requireUserManager()
  if (!admin) return
  await setSignupOpen(String(formData.get('open') ?? '') === '1', admin.id)
  revalidatePath('/users')
}
