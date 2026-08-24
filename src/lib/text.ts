/**
 * Mask an email for logs so PII never lands in plaintext (SEC-P02, BR-L04): keeps only the first
 * character of the local part and the domain, e.g. "owner@moments.test" -> "o***@moments.test".
 */
export function maskEmail(email: string): string {
  const at = email.indexOf('@')
  if (at <= 0) return '***'
  return `${email.slice(0, 1)}***@${email.slice(at + 1)}`
}

/** Turn an ENUM_VALUE or snake/space text into Title Case for display. */
export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
