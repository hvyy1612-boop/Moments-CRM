import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { attemptLogin } from '@/lib/auth/login'
import { hashPassword } from '@/lib/auth/password'
import { issueRecoveryCodes, recoveryCodesLeft, resetPasswordWithRecoveryCode } from '@/lib/auth/recovery-codes'
import { createSession, validateSession } from '@/lib/auth/session'

let companyId = ''
const meta = () => ({ ipAddress: `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` })

beforeAll(async () => {
  companyId = (await prisma.company.findFirstOrThrow({ select: { id: true } })).id
})

async function staffWithCodes() {
  const { hash, algo } = await hashPassword('Old-pass-2026!')
  const user = await prisma.user.create({
    data: { companyId, email: `s26${randomUUID().slice(0, 6)}@staff.moments.com`, passwordHash: hash, passwordAlgo: algo, role: 'STUDIO', name: 'Recovery Test', status: 'ACTIVE' },
  })
  const codes = await issueRecoveryCodes(user.id, meta())
  return { user, codes }
}

describe('recovery codes', () => {
  it('issues six codes and stores only hashes', async () => {
    const { user, codes } = await staffWithCodes()
    expect(codes).toHaveLength(6)
    expect(codes.every((c) => /^[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(c))).toBe(true)
    const rows = await prisma.recoveryCode.findMany({ where: { userId: user.id } })
    expect(rows).toHaveLength(6)
    expect(rows.some((r) => codes.includes(r.codeHash))).toBe(false)
  })

  it('a code resets the password once, signs out every session, and the new password works', async () => {
    const { user, codes } = await staffWithCodes()
    const session = await createSession(user.id, {})
    const res = await resetPasswordWithRecoveryCode({ loginId: user.email.toUpperCase(), code: codes[2]!.toLowerCase(), newPassword: 'New-pass-2026!' }, meta())
    expect(res).toEqual({ ok: true, codesLeft: 5 })
    expect(await validateSession(session.token)).toBeNull()
    expect((await attemptLogin({ email: user.email, password: 'New-pass-2026!', remember: false }, meta())).ok).toBe(true)

    expect((await resetPasswordWithRecoveryCode({ loginId: user.email, code: codes[2]!, newPassword: 'Other-pass-2026!' }, meta())).ok).toBe(false)
  })

  it('wrong codes count toward the sign-in lockout; the 5th locks even a right code out', async () => {
    const { user, codes } = await staffWithCodes()
    for (let i = 0; i < 5; i++) {
      expect((await resetPasswordWithRecoveryCode({ loginId: user.email, code: 'AAAAA-AAAAA', newPassword: 'New-pass-2026!' }, meta())).ok).toBe(false)
    }
    const locked = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { lockedUntil: true } })
    expect(locked.lockedUntil).not.toBeNull()
    expect((await resetPasswordWithRecoveryCode({ loginId: user.email, code: codes[0]!, newPassword: 'New-pass-2026!' }, meta())).ok).toBe(false)
    expect(await recoveryCodesLeft(user.id)).toBe(6)
  })

  it('a new set cancels the old codes; unknown login IDs fail the same way', async () => {
    const { user, codes } = await staffWithCodes()
    const fresh = await issueRecoveryCodes(user.id, meta())
    expect(await recoveryCodesLeft(user.id)).toBe(6)
    expect((await resetPasswordWithRecoveryCode({ loginId: user.email, code: codes[0]!, newPassword: 'New-pass-2026!' }, meta())).ok).toBe(false)
    expect((await resetPasswordWithRecoveryCode({ loginId: user.email, code: fresh[0]!, newPassword: 'New-pass-2026!' }, meta())).ok).toBe(true)
    expect((await resetPasswordWithRecoveryCode({ loginId: 'nobody@staff.moments.com', code: fresh[1]!, newPassword: 'New-pass-2026!' }, meta())).ok).toBe(false)
  })

  it('a removed (soft-deleted) account cannot recover', async () => {
    const { user, codes } = await staffWithCodes()
    await prisma.user.update({ where: { id: user.id }, data: { status: 'DELETED', isActive: false } })
    expect((await resetPasswordWithRecoveryCode({ loginId: user.email, code: codes[0]!, newPassword: 'New-pass-2026!' }, meta())).ok).toBe(false)
  })
})
