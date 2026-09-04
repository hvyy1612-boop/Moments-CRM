import { randomBytes } from 'node:crypto'
import { prisma } from '@/lib/db'

export const STAFF_DOMAIN = 'staff.moments.com'

const ID_RE = new RegExp(`^m(\\d{6})@${STAFF_DOMAIN.replace(/\./g, '\\.')}$`)

export async function nextStaffLoginId(): Promise<string> {
  const rows = await prisma.user.findMany({
    where: { email: { endsWith: `@${STAFF_DOMAIN}` } },
    select: { email: true },
  })
  let max = 0
  for (const row of rows) {
    const match = ID_RE.exec(row.email)
    if (match?.[1]) max = Math.max(max, Number.parseInt(match[1], 10))
  }
  const next = String(max + 1).padStart(6, '0')
  return `m${next}@${STAFF_DOMAIN}`
}

export function generateTempPassword(): string {
  return randomBytes(12).toString('base64url')
}
