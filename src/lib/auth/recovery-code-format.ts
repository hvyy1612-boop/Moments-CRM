/**
 * Recovery code shape, shared by the server (issue / verify) and the browser (copy / download). Pure: no
 * crypto, no database, so it can be imported from a client component.
 *
 * A code is 10 characters from an alphabet without look-alikes (no 0/O, 1/I/L), shown as XXXXX-XXXXX.
 */
export const RECOVERY_CODE_COUNT = 6
export const RECOVERY_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const RECOVERY_CODE_LENGTH = 10

/** XXXXXXXXXX -> XXXXX-XXXXX */
export function formatRecoveryCode(raw: string): string {
  return `${raw.slice(0, 5)}-${raw.slice(5)}`
}

/** What the staff member typed -> the stored form: upper-case, no spaces or hyphens. */
export function normalizeRecoveryCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** The .txt file the "Download" button saves (ProtonMail-style): who, when, how to use, the codes. */
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
