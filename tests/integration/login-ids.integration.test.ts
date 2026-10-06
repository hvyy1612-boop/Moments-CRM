import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { isInternalLoginId, LOGIN_ID_FORMAT, nextStaffLoginId } from '@/lib/auth/staff'

/**
 * Login IDs carry the role in their suffix (like student vs staff university addresses) and are
 * role letter + 2-digit year + 4 random digits, never a guessable count from 1.
 */

let companyId = ''
beforeAll(async () => {
  companyId = (await prisma.company.findFirstOrThrow({ select: { id: true } })).id
})

const IN_2026 = new Date('2026-10-06T00:00:00Z')

describe('role-based login IDs', () => {
  it('admin and staff get their own suffix, the year and 4 random digits', async () => {
    expect(await nextStaffLoginId('ADMIN', IN_2026)).toMatch(/^a26[1-9]\d{3}@admin\.moments\.com$/)
    expect(await nextStaffLoginId('STUDIO', IN_2026)).toMatch(/^s26[1-9]\d{3}@staff\.moments\.com$/)
    expect(await nextStaffLoginId('EDITOR', IN_2026)).toMatch(/^e26[1-9]\d{3}@editor\.moments\.com$/)
  })

  it('the year is the Sydney year the account is made', async () => {
    // 31 Dec 2026 14:00 UTC is already 1 Jan 2027 in Sydney.
    expect(await nextStaffLoginId('STUDIO', new Date('2026-12-31T14:00:00Z'))).toMatch(/^s27\d{4}@/)
  })

  it('never hands out an ID that already exists, including a removed account\'s', async () => {
    const ids = new Set<string>()
    for (let i = 0; i < 40; i++) ids.add(await nextStaffLoginId('STUDIO', IN_2026))
    expect(ids.size).toBeGreaterThan(30) // random, not a count: repeated draws spread out
    const taken = [...ids][0]!
    await prisma.user.create({
      data: { companyId, email: taken, name: `Removed ${randomUUID().slice(0, 6)}`, role: 'STUDIO', passwordHash: 'x', passwordAlgo: 'argon2id', isActive: false, status: 'DELETED' },
    })
    for (let i = 0; i < 40; i++) expect(await nextStaffLoginId('STUDIO', IN_2026)).not.toBe(taken)
  })

  it('every issued suffix is internal, so nothing is ever emailed to it; real addresses are not', () => {
    for (const { domain } of Object.values(LOGIN_ID_FORMAT)) expect(isInternalLoginId(`x261234@${domain}`)).toBe(true)
    expect(isInternalLoginId('m000123@staff.moments.com')).toBe(true) // older IDs too
    expect(isInternalLoginId('owner@momentsphotography.com.au')).toBe(false)
    expect(isInternalLoginId('jane@gmail.com')).toBe(false)
  })
})
