import { randomBytes, randomInt } from 'node:crypto'
import { prisma } from '@/lib/db'
import { sydneyYmd } from '@/lib/time'
import type { Role } from './permissions'

/**
 * Internal Staff Login IDs (see the Auth Blueprint). They look like emails but are NOT mailboxes - they
 * are usernames the system issues, kept in the unique User.email column (no schema change). Like a
 * university's student vs staff addresses, the part after @ tells the role at a glance:
 *   Admin a261957@admin.moments.com · staff s264831@staff.moments.com · editor e263310@editor.moments.com
 * = role letter + the 2-digit year the account was made (Sydney) + 4 random digits. Random, not counted
 * from 1, so nobody can guess a colleague's ID from their own (sequential IDs invite password guessing
 * and deliberate lock-outs).
 *
 * The suffix is only a label: what a person may do is ALWAYS read from User.role on the server, never
 * from the login ID. moments.com is not the studio's domain (someone else receives its mail), so
 * nothing is ever emailed to a login ID - see {@link isInternalLoginId}.
 */
export const LOGIN_ID_FORMAT: Record<Role, { prefix: string; domain: string }> = {
  ADMIN: { prefix: 'a', domain: 'admin.moments.com' },
  STUDIO: { prefix: 's', domain: 'staff.moments.com' },
  EDITOR: { prefix: 'e', domain: 'editor.moments.com' },
}

/** Every domain the app issues login IDs on (older m000123@staff.moments.com IDs included). */
export const INTERNAL_LOGIN_DOMAINS: readonly string[] = [...new Set(Object.values(LOGIN_ID_FORMAT).map((f) => f.domain))]

/** True for an app-issued login ID: it cannot receive mail, so no email may ever be sent to it. */
export function isInternalLoginId(email: string): boolean {
  const domain = email.trim().toLowerCase().split('@')[1]
  return domain != null && INTERNAL_LOGIN_DOMAINS.includes(domain)
}

/**
 * A new, unused login ID for a role: letter + 2-digit year + 4 random digits (1000-9999, so it never
 * reads like a count). Checked against every account ever issued, removed ones included, so an ID is
 * never handed out twice; the caller still retries on a unique-email clash from a simultaneous create.
 */
export async function nextStaffLoginId(role: Role, now: Date = new Date()): Promise<string> {
  const { prefix, domain } = LOGIN_ID_FORMAT[role]
  const yy = String(sydneyYmd(now).year % 100).padStart(2, '0')
  for (let attempt = 0; attempt < 50; attempt++) {
    const id = `${prefix}${yy}${randomInt(1000, 10000)}@${domain}`
    if (!(await prisma.user.findUnique({ where: { email: id }, select: { id: true } }))) return id
  }
  throw new Error('Could not find a free login ID. Please try again.')
}

/**
 * A high-entropy one-time password shown to the admin once, then discarded (only its Argon2id hash is
 * stored). 12 random bytes -> 16 URL-safe chars, comfortably over the length minimum.
 */
export function generateTempPassword(): string {
  return randomBytes(12).toString('base64url')
}
