import { randomBytes } from 'node:crypto'
import { prisma } from '@/lib/db'

/**
 * Internal Staff Login IDs (see the Auth Blueprint). These look like emails (`m000127@staff.moments.com`)
 * but are NOT deliverable email addresses - they are usernames the system issues, never used to send
 * mail. They live in the User.email column (which is the unique login identifier), so no schema change
 * is needed. The `@staff.moments.com` domain is a naming convention the app owns, not a real mailbox.
 */
export const STAFF_DOMAIN = 'staff.moments.com'

const ID_RE = new RegExp(`^m(\\d{6})@${STAFF_DOMAIN.replace(/\./g, '\\.')}$`)

/** The next sequential Staff Login ID, e.g. `m000001@staff.moments.com` then `m000002@…`. */
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

/**
 * A high-entropy one-time password shown to the admin once, then discarded (only its Argon2id hash is
 * stored). 12 random bytes -> 16 URL-safe chars, comfortably over the length minimum.
 */
export function generateTempPassword(): string {
  return randomBytes(12).toString('base64url')
}
