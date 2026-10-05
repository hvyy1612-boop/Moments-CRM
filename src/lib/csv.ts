/**
 * One CSV cell. Quotes a value containing a comma, quote or line break, and (OWASP CSV injection)
 * prefixes a value that starts like a formula with ' so Excel / Sheets show it as text instead of
 * running it - client names arrive from the PUBLIC enquiry form.
 */
export function csvCell(raw: string): string {
  const value = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}
