import { randomBytes } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import {
  exchangeGoogleCode,
  googleCallbackUrl,
  googleClient,
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
} from '@/lib/auth/google'
import { hashPassword } from '@/lib/auth/password'
import { createSession, revokeSessionByToken, SESSION_COOKIE } from '@/lib/auth/session'
import { prisma } from '@/lib/db'
import { requireCompany } from '@/lib/domain/project'
import { googleEnabled } from '@/lib/env'
import { requestMeta } from '@/lib/http'

export const runtime = 'nodejs'

const USER_SELECT = { id: true, isActive: true, googleSub: true, lockedUntil: true } as const

/**
 * Google sign-in callback (§8.5, BR-G). Verifies state + PKCE (BR-G09), exchanges the code and
 * requires a Google-verified email (BR-G01). An unknown email becomes a PENDING account awaiting the
 * same admin approval as self-registration; a known active account gets a normal session with the
 * standard lifetimes (BR-G08). Roles come from our own record, never from Google (BR-G04); the
 * account lockout applies here too (BR-G12); and only the subject id is stored, never a token (BR-G03).
 */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin
  const clearTemp = (res: NextResponse) => {
    res.cookies.delete(OAUTH_STATE_COOKIE)
    res.cookies.delete(OAUTH_VERIFIER_COOKIE)
    return res
  }
  const toLogin = (params = '') => clearTemp(NextResponse.redirect(new URL(`/login${params}`, origin)))

  if (!googleEnabled) return NextResponse.redirect(new URL('/login', origin))

  const meta = await requestMeta()
  const logFailure = (userId?: string) =>
    prisma.signInLog.create({
      data: {
        eventType: 'google_login_failure',
        userId: userId ?? null,
        emailAttempted: null,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        outcome: 'FAILURE',
      },
    })

  const params = request.nextUrl.searchParams
  const code = params.get('code')
  const returnedState = params.get('state')
  const cookieState = request.cookies.get(OAUTH_STATE_COOKIE)?.value
  const verifier = request.cookies.get(OAUTH_VERIFIER_COOKIE)?.value

  // BR-G09: state and verifier must both be present and the returned state must match what we issued.
  if (!code || !returnedState || !cookieState || !verifier || returnedState !== cookieState) {
    await logFailure()
    return toLogin('?error=google')
  }

  const identity = await exchangeGoogleCode(googleClient(googleCallbackUrl(origin)), code, verifier)
  // BR-G01: reject anything that is not a Google-verified email.
  if (!identity || !identity.emailVerified) {
    await logFailure()
    return toLogin('?error=google')
  }

  // Match by linked subject id first, then by verified email. Both columns are unique.
  const existing =
    (await prisma.user.findUnique({ where: { googleSub: identity.sub }, select: USER_SELECT })) ??
    (await prisma.user.findUnique({ where: { email: identity.email }, select: USER_SELECT }))

  // Unknown Google account -> create a PENDING record and wait for admin approval (same gate as
  // self-registration). It gets an unusable random password; Google is its way in once approved.
  if (!existing) {
    const unusable = await hashPassword(randomBytes(32).toString('base64url'))
    let newUserId = ''
    await prisma.$transaction(async (tx) => {
      const company = await requireCompany(tx)
      const created = await tx.user.create({
        data: {
          companyId: company.id,
          email: identity.email,
          name: identity.name ?? identity.email,
          googleSub: identity.sub,
          passwordHash: unusable.hash,
          passwordAlgo: unusable.algo,
          role: 'STUDIO',
          isActive: false,
          status: 'PENDING',
        },
      })
      newUserId = created.id
      await tx.auditLog.create({
        data: {
          companyId: company.id,
          action: 'auth.user_registered_google',
          entityType: 'User',
          entityId: created.id,
          afterData: { email: created.email, name: created.name },
        },
      })
    })
    await prisma.signInLog.create({
      data: {
        eventType: 'google_login_pending',
        userId: newUserId,
        emailAttempted: identity.email,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        outcome: 'FAILURE',
      },
    })
    return toLogin('?pending=1')
  }

  // A different Google account already claims this person's email row: refuse rather than relink.
  if (existing.googleSub && existing.googleSub !== identity.sub) {
    await logFailure(existing.id)
    return toLogin('?error=google')
  }

  // BR-G12: the lock is on the User, so no method (password or Google) bypasses it.
  if (existing.lockedUntil && existing.lockedUntil.getTime() > Date.now()) {
    await logFailure(existing.id)
    return toLogin('?error=google')
  }

  // Known but not yet approved (PENDING / REJECTED): same await-approval outcome, no session.
  if (!existing.isActive) {
    await logFailure(existing.id)
    return toLogin('?pending=1')
  }

  // First Google sign-in for a password account with this verified email: link the subject id.
  if (!existing.googleSub) {
    await prisma.user.update({ where: { id: existing.id }, data: { googleSub: identity.sub } })
  }

  // Success: rotate the old session (SEC-S03) and issue a new one with the standard lifetimes.
  const previous = request.cookies.get(SESSION_COOKIE)?.value
  if (previous) await revokeSessionByToken(previous)
  const session = await createSession(existing.id, {
    userAgent: meta.userAgent,
    ipAddress: meta.ipAddress,
    remember: false,
  })
  await prisma.user.update({ where: { id: existing.id }, data: { lastLoginAt: new Date() } })
  await prisma.signInLog.create({
    data: {
      eventType: 'google_login_success',
      userId: existing.id,
      emailAttempted: identity.email,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      outcome: 'SUCCESS',
    },
  })

  const res = clearTemp(NextResponse.redirect(new URL('/dashboard', origin)))
  res.cookies.set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  })
  return res
}
