import { NextResponse, type NextRequest } from 'next/server'

/**
 * Security headers on every response (SEC-A05) and the CSRF cookie mint (SEC-A04).
 *
 * Scripts are strict: per-request nonce plus strict-dynamic, no unsafe-inline ('unsafe-eval' is
 * added in development only, for React Fast Refresh). Next.js reads the nonce from the request's
 * Content-Security-Policy header and applies it to the scripts it emits. Styles allow inline
 * values because React style attributes and Tailwind's streamed style tags require it; script
 * injection is the attack CSP exists to stop and that surface stays strict (D-023).
 *
 * CSRF_COOKIE is duplicated from csrf.ts because middleware runs on the edge runtime and must not
 * import node:crypto; the value is asserted equal by a unit test.
 */
const CSRF_COOKIE = 'moments_csrf'

export function middleware(request: NextRequest) {
  const nonceBytes = new Uint8Array(16)
  crypto.getRandomValues(nonceBytes)
  const nonce = btoa(String.fromCharCode(...nonceBytes))

  const isDev = process.env.NODE_ENV === 'development'
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('content-security-policy', csp)
  requestHeaders.set('x-nonce', nonce)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', csp)
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains')
  }

  if (!request.cookies.get(CSRF_COOKIE)) {
    const tokenBytes = new Uint8Array(32)
    crypto.getRandomValues(tokenBytes)
    const token = Array.from(tokenBytes, (b) => b.toString(16).padStart(2, '0')).join('')
    response.cookies.set(CSRF_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
    })
  }

  return response
}

export const config = {
  // Pages and API routes all get the headers; static assets are skipped.
  matcher: ['/((?!_next/static|_next/image|icon.svg|favicon.ico).*)'],
}
