/**
 * Password composition rules, shared by the client form and the server policy.
 *
 * This module has NO server-only dependencies (no argon2, no Prisma), so a Client Component may import
 * it to show a live requirements checklist as the user types. The hashing lives in ./password.ts,
 * which imports these same rules to enforce them on the server (checkPasswordPolicy) - so what the
 * form ticks off and what the server accepts can never drift apart.
 *
 * Policy: a minimum length plus a letter, a number, and a special character. Longer is still stronger,
 * but a clear, visible rule set is easier for staff than a single opaque length gate.
 */
export const PASSWORD_MIN_LENGTH = 8

export type PasswordRule = {
  id: string
  /** Human-readable requirement shown next to its tick in the form. */
  label: string
  test: (password: string) => boolean
}

export const PASSWORD_RULES: readonly PasswordRule[] = [
  { id: 'length', label: `At least ${PASSWORD_MIN_LENGTH} characters`, test: (p) => p.length >= PASSWORD_MIN_LENGTH },
  { id: 'letter', label: 'A letter', test: (p) => /[A-Za-z]/.test(p) },
  { id: 'number', label: 'A number', test: (p) => /[0-9]/.test(p) },
  { id: 'special', label: 'A symbol (! ? @ #)', test: (p) => /[^A-Za-z0-9]/.test(p) },
] as const

/** True only when every visible rule passes. Used by the form (live) and the server policy. */
export function meetsPasswordRules(password: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(password))
}
