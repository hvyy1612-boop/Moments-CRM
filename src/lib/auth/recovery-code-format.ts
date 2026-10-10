
export const RECOVERY_CODE_COUNT = 6
export const RECOVERY_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const RECOVERY_CODE_LENGTH = 10

export function formatRecoveryCode(raw: string): string {
  return `${raw.slice(0, 5)}-${raw.slice(5)}`
}

export function normalizeRecoveryCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function recoveryCodesFileText(loginId: string, codes: string[], createdLabel: string): string {
  return [
    'Moments Photography and Film - password recovery codes',
    '',
    `Login ID: ${loginId}`,
    `Created: ${createdLabel}`,
    '',
    'If you forget your password, open the sign-in page, choose "Forgot password?" and enter your',
    'login ID with ONE of these codes. Each code works once. Creating new codes cancels these.',
    'Keep this file somewhere private.',
    '',
    ...codes.map((code, i) => `${i + 1}. ${code}`),
    '',
  ].join('\n')
}
