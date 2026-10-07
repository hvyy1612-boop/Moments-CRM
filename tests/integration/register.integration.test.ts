import { describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { attemptLogin } from '@/lib/auth/login'
import { recoveryCodesLeft } from '@/lib/auth/recovery-codes'
import { registerAccount, setSignupOpen, SIGNUP_LIMIT_PER_IP, signupOptions } from '@/lib/auth/register'

/** Staff sign-up for the demo: role picked by the person, login ID + recovery codes issued by the system. */

const ip = () => `10.77.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`
const anyAdmin = () => prisma.user.findFirstOrThrow({ where: { role: 'ADMIN' }, select: { id: true } })

describe('staff sign-up', () => {
  it('creates a working Staff account with a role login ID and six recovery codes', async () => {
    const res = await registerAccount({ name: 'Sign Up Staff', role: 'STUDIO', password: 'Sign-up-2026!' }, { ipAddress: ip() })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.loginId).toMatch(/^s\d{6}@staff\.moments\.com$/)
    expect(res.codes).toHaveLength(6)
    const user = await prisma.user.findUniqueOrThrow({ where: { email: res.loginId }, select: { id: true, role: true, status: true, mustChangePassword: true } })
    expect(user).toMatchObject({ role: 'STUDIO', status: 'ACTIVE', mustChangePassword: false })
    expect(await recoveryCodesLeft(user.id)).toBe(6)
    expect((await attemptLogin({ email: res.loginId, password: 'Sign-up-2026!', remember: false }, { ipAddress: ip() })).ok).toBe(true)
  })

  it('gives a Supervisor a supervisor login ID', async () => {
    const res = await registerAccount({ name: 'Sign Up Supervisor', role: 'SUPERVISOR', password: 'Sign-up-2026!' }, { ipAddress: ip() })
    expect(res.ok && res.loginId).toMatch(/^v\d{6}@supervisor\.moments\.com$/)
  })

  it('never offers or accepts Admin once an active Admin exists', async () => {
    await anyAdmin()
    expect((await signupOptions()).roles).toEqual(['STUDIO', 'SUPERVISOR'])
    expect(await registerAccount({ name: 'Would Be Admin', role: 'ADMIN', password: 'Sign-up-2026!' }, { ipAddress: ip() })).toEqual({ ok: false, reason: 'role' })
  })

  it('refuses while an admin has closed sign-up, and limits sign-ups per IP', async () => {
    const admin = await anyAdmin()
    await setSignupOpen(false, admin.id)
    try {
      expect(await registerAccount({ name: 'Closed', role: 'STUDIO', password: 'Sign-up-2026!' }, { ipAddress: ip() })).toEqual({ ok: false, reason: 'closed' })
    } finally {
      await setSignupOpen(true, admin.id)
    }
    const sameIp = ip()
    for (let i = 0; i < SIGNUP_LIMIT_PER_IP; i++) {
      expect((await registerAccount({ name: `Rate ${i}`, role: 'SUPERVISOR', password: 'Sign-up-2026!' }, { ipAddress: sameIp })).ok).toBe(true)
    }
    expect(await registerAccount({ name: 'One Too Many', role: 'SUPERVISOR', password: 'Sign-up-2026!' }, { ipAddress: sameIp })).toEqual({ ok: false, reason: 'rate' })
  })
})
