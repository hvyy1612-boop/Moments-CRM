'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { getActionUser } from '@/lib/auth/guard'
import { passwordCredentials, resetUserPassword } from '@/lib/auth/user-password'
import { revokeAllSessions } from '@/lib/auth/session'
import { generateTempPassword, nextStaffLoginId } from '@/lib/auth/staff'
import { prisma } from '@/lib/db'
import { requireCompany } from '@/lib/domain/project'

/** Only an ADMIN may manage staff accounts. Returns the admin, or null. */
async function requireAdmin() {
  const user = await getActionUser()
  if (!user || user.role !== 'ADMIN') return null
  return user
}

// ---------------------------------------------------------------- Add staff

export type AddStaffState =
  | { status: 'idle' }
  | { status: 'error'; message?: string; errors?: { name?: string } }
  | { status: 'created'; name: string; staffLoginId: string; tempPassword: string }

const addStaffSchema = z.object({
  name: z.string().trim().min(1, 'Enter the staff member’s name').max(150, 'Name is too long'),
  role: z.enum(['ADMIN', 'STUDIO', 'EDITOR']),
})

/** Create a staff account: auto-generate the Staff ID + a temp password, force a change on first login. */
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
  const creds = await passwordCredentials(tempPassword)

  await prisma.$transaction(async (tx) => {
    const company = await requireCompany(tx)
    const created = await tx.user.create({
      data: {
        companyId: company.id,
        email: staffLoginId,
        name: parsed.data.name,
        ...creds,
        role: parsed.data.role,
        isActive: true,
        status: 'ACTIVE',
        mustChangePassword: true,
      },
    })
    await tx.auditLog.create({
      data: {
        companyId: company.id,
        actorUserId: admin.id,
        action: 'auth.staff_created',
        entityType: 'User',
        entityId: created.id,
        afterData: { staffLoginId, name: created.name, role: created.role },
      },
    })
  })

  revalidatePath('/users')
  // The temp password is returned to be shown ONCE; only its Argon2id hash is stored.
  return { status: 'created', name: parsed.data.name, staffLoginId, tempPassword }
}

// ---------------------------------------------------------------- Reset password

export type ResetState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'reset'; staffLoginId: string; tempPassword: string }

/** Issue a new temp password for a staff member (they must change it next login) and log them out. */
export async function resetStaffPasswordAction(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const cookieStore = await cookies()
  if (!verifyCsrf(cookieStore.get(CSRF_COOKIE)?.value, formData.get('csrf'))) {
    return { status: 'error', message: 'Session expired. Refresh the page.' }
  }
  const admin = await requireAdmin()
  if (!admin) return { status: 'error', message: 'Only an admin can reset passwords.' }

  const userId = String(formData.get('userId') ?? '')
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, companyId: true, email: true, name: true } })
  if (!target) return { status: 'error', message: 'That account no longer exists.' }
  // Resetting your OWN password would sign you out before you could copy the temporary one (and login IDs
  // cannot receive reset emails), locking the admin out. Your own password is changed via Change password.
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

// ---------------------------------------------------------------- Enable / disable

/** Enable or disable a staff account. Disabling revokes all their live sessions immediately. */
export async function setStaffActiveAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!verifyCsrf(cookieStore.get(CSRF_COOKIE)?.value, formData.get('csrf'))) return
  const admin = await requireAdmin()
  if (!admin) return

  const userId = String(formData.get('userId') ?? '')
  const active = String(formData.get('active') ?? '') === 'true'
  if (!userId || (userId === admin.id && !active)) return // never disable your own account

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

// ---------------------------------------------------------------- Remove (soft delete)

/**
 * Remove a staff account from the team list WITHOUT hard-deleting the row: mark status DELETED,
 * disable it, and revoke its sessions. The record is retained in the database (referenced by audit
 * logs, sign-in history, and any work they did), it just no longer appears in the Users screen or the
 * roster. Reversible from the database; never destroys history.
 */
export async function removeStaffAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!verifyCsrf(cookieStore.get(CSRF_COOKIE)?.value, formData.get('csrf'))) return
  const admin = await requireAdmin()
  if (!admin) return

  const userId = String(formData.get('userId') ?? '')
  if (!userId || userId === admin.id) return // never remove your own account

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, companyId: true, email: true, name: true, role: true },
  })
  if (!target) return

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
