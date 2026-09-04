import { NextResponse, type NextRequest } from 'next/server'
import {
  exchangeGoogleCode,
  googleCallbackUrl,
  googleClient,
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
} from '@/lib/auth/google'
import { createSession, revokeSessionByToken, SESSION_COOKIE } from '@/lib/auth/session'
import { prisma } from '@/lib/db'
import { googleEnabled } from '@/lib/env'
import { requestMeta } from '@/lib/http'

export const runtime = 'nodejs'

const USER_SELECT = { id: true, isActive: true, googleSub: true, lockedUntil: true } as const

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

  if (!code || !returnedState || !cookieState || !verifier || returnedState !== cookieState) {
    await logFailure()
    return toLogin('?error=google')
  }

  const identity = await exchangeGoogleCode(googleClient(googleCallbackUrl(origin)), code, verifier)

  if (!identity || !identity.emailVerified) {
    await logFailure()
    return toLogin('?error=google')
  }

  const existing =
    (await prisma.user.findUnique({ where: { googleSub: identity.sub }, select: USER_SELECT })) ??
    (await prisma.user.findUnique({ where: { email: identity.email }, select: USER_SELECT }))

  if (!existing || !existing.isActive) {
    await logFailure(existing?.id)
    return toLogin('?error=google')
  }

  if (existing.googleSub && existing.googleSub !== identity.sub) {
    await logFailure(existing.id)
    return toLogin('?error=google')
  }

  if (existing.lockedUntil && existing.lockedUntil.getTime() > Date.now()) {
    await logFailure(existing.id)
    return toLogin('?error=google')
  }

  if (!existing.googleSub) {
    await prisma.user.update({ where: { id: existing.id }, data: { googleSub: identity.sub } })
  }

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
