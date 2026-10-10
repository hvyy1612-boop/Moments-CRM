import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { systemClock, type Clock } from '@/lib/time'
import type { Role } from './permissions'
import { issueRecoveryCodes } from './recovery-codes'
import { nextStaffLoginId } from './staff'
import { passwordCredentials } from './user-password'

export const SIGNUP_LIMIT_PER_IP = 5
const SIGNUP_WINDOW_MS = 60 * 60 * 1000

type CompanySettings = Record<string, unknown>

function settingsOf(raw: Prisma.JsonValue | null | undefined): CompanySettings {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as CompanySettings) : {}
}

export async function signupOptions(): Promise<{ open: boolean; roles: Role[] }> {
  const company = await prisma.company.findFirst({ select: { settings: true } })
  const open = settingsOf(company?.settings).signupOpen !== false
  const hasAdmin = (await prisma.user.count({ where: { role: 'ADMIN', status: 'ACTIVE', isActive: true } })) > 0
  return { open, roles: hasAdmin ? ['STUDIO', 'SUPERVISOR'] : ['ADMIN', 'STUDIO', 'SUPERVISOR'] }
}

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

      if (attempt < 3 && e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue
      throw e
    }
  }
}
