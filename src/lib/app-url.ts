import { headers } from 'next/headers'

/**
 * The app's own public address, for links that leave the app (reset, quote, invoice, contract links).
 * Taken from configuration first, never from the incoming request when configured: a forged Host header
 * must not be able to point a password-reset email at someone else's site (reset-link poisoning).
 */
export async function appBaseUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (configured) return configured.replace(/\/+$/, '')
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  if (vercel) return `https://${vercel.replace(/\/+$/, '')}`
  // Local development with nothing configured: the address the browser used.
  const h = await headers()
  const host = h.get('host')
  if (!host) return 'http://localhost:3000'
  return `${h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')}://${host}`
}
