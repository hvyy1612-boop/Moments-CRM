import { randomBytes, randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { attemptLogin } from '@/lib/auth/login'
import { hashPassword } from '@/lib/auth/password'
import { requestPasswordReset } from '@/lib/auth/password-reset'
import { getIcsForToken, getOrCreateFeedToken, rotateFeedToken } from '@/lib/domain/calendar'
import { signContractByToken } from '@/lib/domain/contract'
import { convertEnquiry, createEnquiry } from '@/lib/domain/enquiry'
import { getInvoiceByToken } from '@/lib/domain/finance'
import { createInvoice } from './helpers'

/** Security behaviour against the real (test) database. */

let companyId = ''
let userId = ''
const ip = () => `10.${[0, 0, 0].map(() => Math.floor(Math.random() * 250)).join('.')}`
const email = () => `sec-${randomUUID().slice(0, 8)}@moments.test`

beforeAll(async () => {
  companyId = (await prisma.company.findFirstOrThrow({ select: { id: true } })).id
  userId = (await prisma.user.findFirstOrThrow({ select: { id: true } })).id
})

async function staff(password: string) {
  const { hash, algo } = await hashPassword(password)
  return prisma.user.create({ data: { companyId, email: email(), passwordHash: hash, passwordAlgo: algo, role: 'STUDIO', name: 'Security Test' } })
}

describe('login lockout cannot be used to keep staff out', () => {
  it('after an attacker locks the account, the owner still signs in from an address they used before', async () => {
    const password = 'Right-pass-1!'
    const u = await staff(password)
    const home = ip()
    expect((await attemptLogin({ email: u.email, password, remember: false }, { ipAddress: home })).ok).toBe(true)

    const attacker = ip()
    for (let i = 0; i < 5; i++) await attemptLogin({ email: u.email, password: 'wrong-guess', remember: false }, { ipAddress: attacker })
    expect((await prisma.user.findUnique({ where: { id: u.id } }))?.lockedUntil).not.toBeNull()

    // A new address is still refused while the lock lasts, even with the right password...
    expect((await attemptLogin({ email: u.email, password, remember: false }, { ipAddress: ip() })).ok).toBe(false)
    // ...but the owner's known address gets through.
    expect((await attemptLogin({ email: u.email, password, remember: false }, { ipAddress: home })).ok).toBe(true)
  })
})

describe('password reset emails are throttled', () => {
  it('at most 3 reset links per account per hour', async () => {
    const u = await staff('Right-pass-1!')
    for (let i = 0; i < 3; i++) expect(await requestPasswordReset(u.email, ip())).not.toBeNull()
    expect(await requestPasswordReset(u.email, ip())).toBeNull()
  })
})

describe('calendar subscription link', () => {
  it('resetting the link retires the old one', async () => {
    const before = await getOrCreateFeedToken()
    expect(await getIcsForToken(before)).not.toBeNull()
    const after = await rotateFeedToken(userId)
    expect(after).not.toBe(before)
    expect(await getIcsForToken(before)).toBeNull()
    expect(await getIcsForToken(after)).not.toBeNull()
    expect(await getIcsForToken(after.slice(0, -1) + (after.endsWith('0') ? '1' : '0'))).toBeNull()
  })
})

async function sentContract() {
  const e = await createEnquiry({ name: 'Contract Client', email: email() })
  const { projectId } = await convertEnquiry(e.id)
  const contract = await prisma.contract.create({
    data: {
      projectId: projectId!,
      signToken: randomBytes(24).toString('base64url'),
      status: 'SENT',
      versions: { create: { versionNumber: 1, status: 'SENT', termsSnapshot: {} } },
    },
    include: { versions: true },
  })
  await prisma.contract.update({ where: { id: contract.id }, data: { currentVersionId: contract.versions[0]!.id } })
  return { projectId: projectId!, signToken: contract.signToken }
}

describe('signing a contract never revives or rewinds a job', () => {
  it('a cancelled job cannot be signed back to Confirmed', async () => {
    const { projectId, signToken } = await sentContract()
    await prisma.project.update({ where: { id: projectId }, data: { lifecycleStatus: 'CANCELLED' } })
    await expect(signContractByToken(signToken, 'Client', '1.1.1.1')).rejects.toThrow(/no longer active/i)
    expect((await prisma.project.findUnique({ where: { id: projectId } }))?.lifecycleStatus).toBe('CANCELLED')
  })

  it('a delivered job stays delivered', async () => {
    const { projectId, signToken } = await sentContract()
    await prisma.project.update({ where: { id: projectId }, data: { lifecycleStatus: 'COMPLETED' } })
    await signContractByToken(signToken, 'Client', '1.1.1.1')
    expect((await prisma.project.findUnique({ where: { id: projectId } }))?.lifecycleStatus).toBe('COMPLETED')
  })

  it('a signature alone does not book: the lead keeps waiting for the deposit', async () => {
    const { projectId, signToken } = await sentContract()
    await prisma.project.update({ where: { id: projectId }, data: { lifecycleStatus: 'BOOKING_REQUESTED' } })
    await signContractByToken(signToken, 'Client', '1.1.1.1')
    expect((await prisma.project.findUnique({ where: { id: projectId } }))?.lifecycleStatus).toBe('BOOKING_REQUESTED')
    const lead = await prisma.enquiry.findFirstOrThrow({ where: { convertedProjectId: projectId } })
    expect(lead.status).toBe('AWAITING_BOOKING_CONFIRMATION')
    expect((await prisma.contract.findFirstOrThrow({ where: { projectId } })).status).toBe('SIGNED')
  })
})

describe('the public invoice link exposes only what the invoice prints', () => {
  it('does not hand Company Settings secrets to the page', async () => {
    const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { settings: true } })
    const settings = (company.settings ?? {}) as Record<string, unknown>
    await prisma.company.update({ where: { id: companyId }, data: { settings: { ...settings, bsb: '062-000', calendarFeedToken: 'a'.repeat(32) } } })
    const e = await createEnquiry({ name: 'Invoice Client', email: email() })
    const { projectId } = await convertEnquiry(e.id)
    const inv = await createInvoice(projectId!, { type: 'DEPOSIT', description: 'Deposit', amount: '500' }, null)
    const token = randomBytes(16).toString('hex')
    await prisma.invoice.update({ where: { id: inv.id }, data: { accessToken: token } }) // as Send invoice does
    const pub = await getInvoiceByToken(token)
    const shown = pub!.project.company.settings as Record<string, unknown>
    expect(shown.bsb).toBe('062-000')
    expect(shown).not.toHaveProperty('calendarFeedToken')
  })
})
