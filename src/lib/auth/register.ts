import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { systemClock, type Clock } from '@/lib/time'
import type { Role } from './permissions'
import { issueRecoveryCodes } from './recovery-codes'
import { nextStaffLoginId } from './staff'
import { passwordCredentials } from './user-password'

/**
 * Self sign-up for staff trying the system (demo). The person picks a role; the system issues the login ID
 * for that role and six recovery codes, all shown once on the result screen.
 *
 * - Only one Admin (like the old "Owner"): the Admin option disappears once an active Admin exists, so a
 *   stranger can never sign up as Admin of a live studio.
 * - An Admin can close sign-up on the Users page (`settings.signupOpen = false`); open when unset.
 * - At most 5 sign-ups per IP address per hour; every sign-up is logged.
 */
export const SIGNUP_LIMIT_PER_IP = 5
const SIGNUP_WINDOW_MS = 60 * 60 * 1000

type CompanySettings = Record<string, unknown>

function settingsOf(raw: Prisma.JsonValue | null | undefined): CompanySettings {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as CompanySettings) : {}
}

/** Is sign-up open, and which roles may be chosen right now. */
export async function signupOptions(): Promise<{ open: boolean; roles: Role[] }> {
  const company = await prisma.company.findFirst({ select: { settings: true } })
  const open = settingsOf(company?.settings).signupOpen !== false
  const hasAdmin = (await prisma.user.count({ where: { role: 'ADMIN', status: 'ACTIVE', isActive: true } })) > 0
  return { open, roles: hasAdmin ? ['STUDIO', 'SUPERVISOR'] : ['ADMIN', 'STUDIO', 'SUPERVISOR'] }
}

/** Admin switch on the Users page. */
export async function setSignupOpen(open: boolean, actorUserId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const company = await tx.company.findFirstOrThrow({ select: { id: true, settings: true } })
    const next = { ...settingsOf(company.settings), signupOpen: open }
    await tx.company.update({ where: { id: company.id }, data: { settings: next as Prisma.InputJsonValue } })
    await tx.auditLog.create({
      data: { companyId: company.id, actorUserId, action: open ? 'auth.signup_opened' : 'auth.signup_closed', entityType: 'Company', entityId: company.id },
    })
  })
}

export type RegisterResult =
  | { ok: true; loginId: string; codes: string[] }
  | { ok: false; reason: 'closed' | 'role' | 'rate' }

/** Create a staff account the person chose the role and password for (password already policy-checked). */
export async function registerAccount(
  input: { name: string; role: Role; password: string },
  meta: { ipAddress: string; userAgent?: string | null },
  clock: Clock = systemClock,
): Promise<RegisterResult> {
  const options = await signupOptions()
  if (!options.open) return { ok: false, reason: 'closed' }
  if (!options.roles.includes(input.role)) return { ok: false, reason: 'role' }

  const since = new Date(clock.now().getTime() - SIGNUP_WINDOW_MS)
  const recent = await prisma.signInLog.count({ where: { eventType: 'account_registered', ipAddress: meta.ipAddress, createdAt: { gte: since } } })
  if (recent >= SIGNUP_LIMIT_PER_IP) return { ok: false, reason: 'rate' }

  const creds = await passwordCredentials(input.password)
  for (let attempt = 0; ; attempt++) {
    const loginId = await nextStaffLoginId(input.role)
    try {
      const user = await prisma.$transaction(async (tx) => {
        const company = await tx.company.findFirstOrThrow({ select: { id: true } })
        const created = await tx.user.create({
          data: { companyId: company.id, email: loginId, name: input.name, ...creds, role: input.role, isActive: true, status: 'ACTIVE', mustChangePassword: false },
        })
        await tx.auditLog.create({
          data: { companyId: company.id, actorUserId: created.id, action: 'auth.staff_registered', entityType: 'User', entityId: created.id, afterData: { loginId, name: input.name, role: input.role } },
        })
        await tx.signInLog.create({
          data: { eventType: 'account_registered', userId: created.id, emailAttempted: loginId, ipAddress: meta.ipAddress, userAgent: meta.userAgent ?? null, outcome: 'SUCCESS' },
        })
        return created
      })
      const codes = await issueRecoveryCodes(user.id, meta)
      return { ok: true, loginId, codes }
    } catch (e) {
      // Two sign-ups drawing the same random ID at once: the unique login ID rejects one; draw again.
      if (attempt < 3 && e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue
      throw e
    }
  }
}
