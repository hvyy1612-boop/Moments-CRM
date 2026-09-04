
export const PASSWORD_MIN_LENGTH = 8

export type PasswordRule = {
  id: string

  label: string
  test: (password: string) => boolean
}

export const PASSWORD_RULES: readonly PasswordRule[] = [
  { id: 'length', label: `At least ${PASSWORD_MIN_LENGTH} characters`, test: (p) => p.length >= PASSWORD_MIN_LENGTH },
  { id: 'letter', label: 'A letter', test: (p) => /[A-Za-z]/.test(p) },
  { id: 'number', label: 'A number', test: (p) => /[0-9]/.test(p) },
  { id: 'special', label: 'A special character (e.g. ! ? @ #)', test: (p) => /[^A-Za-z0-9]/.test(p) },
] as const

export function meetsPasswordRules(password: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(password))
}
