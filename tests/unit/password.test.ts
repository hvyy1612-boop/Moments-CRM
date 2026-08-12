import { describe, it, expect } from 'vitest'
import {
  checkPasswordPolicy,
  hashPassword,
  needsRehash,
  verifyPassword,
  PASSWORD_ALGO,
} from '@/lib/auth/password'

describe('password hashing and policy (SEC-P01, SEC-P04, SEC-P05)', () => {
  it('SEC-P01 hashes with Argon2id and verifies the correct password', async () => {
    const { hash, algo } = await hashPassword('a-good-long-passphrase')
    expect(algo).toBe(PASSWORD_ALGO)
    expect(hash).toMatch(/^\$argon2id\$/)
    expect(await verifyPassword(hash, algo, 'a-good-long-passphrase')).toBe(true)
  })

  it('SEC-P01 rejects a wrong password without throwing', async () => {
    const { hash, algo } = await hashPassword('a-good-long-passphrase')
    expect(await verifyPassword(hash, algo, 'not-the-password')).toBe(false)
  })

  it('SEC-P01 uses a unique salt so the same password hashes differently each time', async () => {
    const a = await hashPassword('a-good-long-passphrase')
    const b = await hashPassword('a-good-long-passphrase')
    expect(a.hash).not.toBe(b.hash)
  })

  it('SEC-P01 encodes at least the mandated parameters (m>=19456, t>=2, p=1)', async () => {
    const { hash } = await hashPassword('a-good-long-passphrase')
    const match = hash.match(/\$m=(\d+),t=(\d+),p=(\d+)\$/)
    expect(match).not.toBeNull()
    expect(Number(match?.[1])).toBeGreaterThanOrEqual(19456)
    expect(Number(match?.[2])).toBeGreaterThanOrEqual(2)
    expect(Number(match?.[3])).toBe(1)
  })

  it('SEC-P04 rejects a password shorter than 12 characters', () => {
    expect(checkPasswordPolicy('short')).toBe('too_short')
    expect(checkPasswordPolicy('elevenchars')).toBe('too_short')
  })

  it('SEC-P04 rejects a known-common password regardless of case', () => {
    expect(checkPasswordPolicy('passwordpassword')).toBe('too_common')
    expect(checkPasswordPolicy('PasswordPassword')).toBe('too_common')
  })

  it('SEC-P04 accepts a long, uncommon password', () => {
    expect(checkPasswordPolicy('correct horse battery staple')).toBeNull()
  })

  it('SEC-P05 flags a hash with weaker parameters for re-hashing', () => {
    const weak = '$argon2id$v=19$m=8192,t=1,p=1$c29tZXNhbHQ$c29tZWhhc2h2YWx1ZQ'
    expect(needsRehash(weak, PASSWORD_ALGO)).toBe(true)
  })

  it('SEC-P05 does not re-hash a current-strength hash', async () => {
    const { hash, algo } = await hashPassword('a-good-long-passphrase')
    expect(needsRehash(hash, algo)).toBe(false)
  })

  it('SEC-P05 treats an unknown algorithm as needing a re-hash', () => {
    expect(needsRehash('whatever', 'bcrypt')).toBe(true)
  })

  it('rejects an unsupported algorithm on verify (programming error, not a login)', async () => {
    await expect(verifyPassword('x', 'md5', 'a-good-long-passphrase')).rejects.toThrow(/Unsupported/)
  })
})
