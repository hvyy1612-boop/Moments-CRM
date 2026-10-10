import { randomBytes, randomInt } from 'node:crypto'
import { prisma } from '@/lib/db'
import { sydneyYmd } from '@/lib/time'
import type { Role } from './permissions'

export const LOGIN_ID_FORMAT: Record<Role, { prefix: string; domain: string }> = {
  ADMIN: { prefix: 'a', domain: 'admin.moments.com' },
  STUDIO: { prefix: 's', domain: 'staff.moments.com' },
  SUPERVISOR: { prefix: 'v', domain: 'supervisor.moments.com' },
}

export const INTERNAL_LOGIN_DOMAINS: readonly string[] = [...new Set(Object.values(LOGIN_ID_FORMAT).map((f) => f.domain))]

export function isInternalLoginId(email: string): boolean {
  const domain = email.trim().toLowerCase().split('@')[1]
  return domain != null && INTERNAL_LOGIN_DOMAINS.includes(domain)
}

export async function nextStaffLoginId(role: Role, now: Date = new Date()): Promise<string> {
  const { prefix, domain } = LOGIN_ID_FORMAT[role]
  const yy = String(sydneyYmd(now).year % 100).padStart(2, '0')
  for (let attempt = 0; attempt < 50; attempt++) {
    const id = `${prefix}${yy}${randomInt(1000, 10000)}@${domain}`
    if (!(await prisma.user.findUnique({ where: { email: id }, select: { id: true } }))) return id
  }
  throw new Error('Could not find a free login ID. Please try again.')
}

export function generateTempPassword(): string {
  return randomBytes(12).toString('base64url')
}
