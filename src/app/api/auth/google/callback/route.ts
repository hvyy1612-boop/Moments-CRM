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

const USER_SELECT = { id: true, isActive: true, status: true, googleSub: true, lockedUntil: true } as const

/**
 * Google sign-in callback (§8.5, BR-G). Verifies state + PKCE (BR-G09), exchanges the code and
 * requires a Google-verified email (BR-G01).
 *
 * Staff self-onboard: a Google-verified account is created ACTIVE (no admin approval) and sent to
 * /onboarding to set their display name; a returning account gets a normal session straight to the
 * dashboard. Access is gated UPSTREAM by the Google "Test users" list - keep the OAuth app in Testing
 * mode with only staff listed, so an arbitrary Google account can never reach this callback. Roles
 * come from our own record, never from Google (BR-G04); the account lockout applies here too
 * (BR-G12); only the subject id is stored, never a token (BR-G03). A deliberately disabled/rejected
 * account (isActive=false with a non-PENDING status) stays blocked - Google never re-enables it.
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

  // Issue a fresh session for the user and redirect. Rotates any existing session first (SEC-S03).
  const signIn = async (userId: string, email: string, destination: string) => {
    const previous = request.cookies.get(SESSION_COOKIE)?.value
    if (previous) await revokeSessionByToken(previous)
    const session = await createSession(userId, {
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
      remember: false,
    })
    await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } })
    await prisma.signInLog.create({
      data: {
        eventType: 'google_login_success',
        userId,
        emailAttempted: email,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        outcome: 'SUCCESS',
      },
    })
    const res = clearTemp(NextResponse.redirect(new URL(destination, origin)))
    res.cookies.set(SESSION_COOKIE, session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
    })
    return res
  }

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

  // Unknown Google account -> self-onboard: create an ACTIVE staff account (no admin approval) and
  // send them to /onboarding to set their name. It gets an unusable random password; Google is its
  // way in. (Gated upstream by the Google Test users list - see the file header.)
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
          isActive: true,
          status: 'ACTIVE',
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
    return signIn(newUserId, identity.email, '/onboarding')
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

  // Inactive account: a never-activated one (status PENDING - e.g. an older Google sign-up made under
  // the previous admin-approval model) now self-onboards; a deliberately disabled/rejected one stays
  // blocked so Google can never re-enable someone an admin turned off.
  if (!existing.isActive) {
    if (existing.status !== 'PENDING') {
      await logFailure(existing.id)
      return toLogin('?error=google')
    }
    await prisma.user.update({
      where: { id: existing.id },
      data: { isActive: true, status: 'ACTIVE', googleSub: existing.googleSub ?? identity.sub },
    })
    return signIn(existing.id, identity.email, '/onboarding')
  }

  // Active account. First Google sign-in for a password account with this verified email: link the
  // subject id, then straight to the dashboard.
  if (!existing.googleSub) {
    await prisma.user.update({ where: { id: existing.id }, data: { googleSub: identity.sub } })
  }
  return signIn(existing.id, identity.email, '/dashboard')
}
