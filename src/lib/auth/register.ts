import { prisma } from '@/lib/db'
import { requireCompany } from '@/lib/domain/project'
import { checkPasswordPolicy, hashPassword } from './password'

export type RegisterResult = { ok: true } | { ok: false; error: string }

/**
 * Self-service staff registration. A new account is created INACTIVE (isActive=false) and cannot sign
 * in until an admin approves it (SEC-A01: approval gate). The existing login already refuses inactive
 * accounts with a generic message, so a pending account cannot be used before approval.
 */
export async function registerUser(input: {
  name: string
  email: string
  password: string
}): Promise<RegisterResult> {
  if (checkPasswordPolicy(input.password)) {
    return { ok: false, error: 'Choose a password of at least 12 characters that is not commonly used.' }
  }
  const hashed = await hashPassword(input.password)
  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { email: input.email }, select: { id: true } })
      if (existing) throw new Error('EMAIL_TAKEN')
      const company = await requireCompany(tx)
      const created = await tx.user.create({
        data: {
          companyId: company.id,
          email: input.email,
          name: input.name,
          passwordHash: hashed.hash,
          passwordAlgo: hashed.algo,
          role: 'STUDIO',
          isActive: false,
          status: 'PENDING',
        },
      })
      await tx.auditLog.create({
        data: {
          companyId: company.id,
          action: 'auth.user_registered',
          entityType: 'User',
          entityId: created.id,
          afterData: { email: created.email, name: created.name },
        },
      })
    })
  } catch (e) {
    if (e instanceof Error && e.message === 'EMAIL_TAKEN') {
      return { ok: false, error: 'An account with this email already exists.' }
    }
    return { ok: false, error: 'Could not create the account. Please try again.' }
  }
  return { ok: true }
}
