import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2'
import { COMMON_PASSWORDS } from './common-passwords'
import { meetsPasswordRules } from './password-rules'

export { PASSWORD_MIN_LENGTH, PASSWORD_RULES, meetsPasswordRules } from './password-rules'

const ARGON2ID_OPTIONS = {
  algorithm: 2, // Algorithm.Argon2id
  memoryCost: 19456, // KiB = 19 MiB (SEC-P01: memory 19 MiB or higher)
  timeCost: 2, // 2 iterations
  parallelism: 1,
} as const

export const PASSWORD_ALGO = 'argon2id'

export type PasswordPolicyError = 'weak' | 'too_common'

export function checkPasswordPolicy(password: string): PasswordPolicyError | null {
  if (!meetsPasswordRules(password)) return 'weak'
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return 'too_common'
  return null
}

export type HashedPassword = { hash: string; algo: string }

export async function hashPassword(password: string): Promise<HashedPassword> {
  const hashed = await argonHash(password, ARGON2ID_OPTIONS)
  return { hash: hashed, algo: PASSWORD_ALGO }
}

export async function verifyPassword(storedHash: string, algo: string, password: string): Promise<boolean> {
  if (algo !== PASSWORD_ALGO) {
    throw new Error(`Unsupported password algorithm: ${algo}`)
  }
  try {
    return await argonVerify(storedHash, password, ARGON2ID_OPTIONS)
  } catch {
    return false
  }
}

export function needsRehash(storedHash: string, algo: string): boolean {
  if (algo !== PASSWORD_ALGO) return true
  const match = storedHash.match(/\$argon2id\$v=\d+\$m=(\d+),t=(\d+),p=(\d+)\$/)
  if (!match) return true
  const memory = Number(match[1] ?? '0')
  const time = Number(match[2] ?? '0')
  const parallelism = Number(match[3] ?? '0')
  return (
    memory < ARGON2ID_OPTIONS.memoryCost ||
    time < ARGON2ID_OPTIONS.timeCost ||
    parallelism < ARGON2ID_OPTIONS.parallelism
  )
}
