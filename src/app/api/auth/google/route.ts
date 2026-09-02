import { NextResponse, type NextRequest } from 'next/server'
import {
  googleAuthUrl,
  googleCallbackUrl,
  googleClient,
  newOAuthState,
  newPkce,
  OAUTH_STATE_COOKIE,
  OAUTH_TEMP_MAX_AGE,
  OAUTH_VERIFIER_COOKIE,
} from '@/lib/auth/google'
import { googleEnabled } from '@/lib/env'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin
  if (!googleEnabled) {
    return NextResponse.redirect(new URL('/login', origin))
  }

  const state = newOAuthState()
  const { verifier, challenge } = newPkce()
  const client = googleClient(googleCallbackUrl(origin))
  const authUrl = googleAuthUrl(client, state, challenge)

  const res = NextResponse.redirect(authUrl)
  const opts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const, // MUST be lax: the callback arrives via a cross-site top-level redirect
    path: '/',
    maxAge: OAUTH_TEMP_MAX_AGE,
  }
  res.cookies.set(OAUTH_STATE_COOKIE, state, opts)
  res.cookies.set(OAUTH_VERIFIER_COOKIE, verifier, opts)
  return res
}
