import { headers } from 'next/headers'

export async function requestMeta(): Promise<{ ipAddress: string; userAgent: string | null }> {
  const h = await headers()
  const forwarded = h.get('x-forwarded-for')
  const ipAddress = forwarded?.split(',')[0]?.trim() || h.get('x-real-ip') || '127.0.0.1'
  return { ipAddress, userAgent: h.get('user-agent') }
}
