'use server'

import { cookies } from 'next/headers'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { acceptQuoteByToken } from '@/lib/domain/quote'
import { requestMeta } from '@/lib/http'
import { acceptQuoteSchema } from '@/lib/validation/quote'

export type AcceptState =
  | { status: 'idle' }
  | { status: 'success' }
  | { status: 'error'; message: string }

export async function acceptQuote(_prev: AcceptState, formData: FormData): Promise<AcceptState> {
  const cookieStore = await cookies()
  if (!verifyCsrf(cookieStore.get(CSRF_COOKIE)?.value, formData.get('csrf'))) {
    return { status: 'error', message: 'Your session expired. Refresh and try again.' }
  }
  const token = String(formData.get('token') ?? '')
  const parsed = acceptQuoteSchema.safeParse({ acceptedName: formData.get('acceptedName') })
  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Type your name to accept.' }
  }
  const meta = await requestMeta()
  try {
    await acceptQuoteByToken(token, parsed.data.acceptedName, meta.ipAddress)
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : 'Could not accept.' }
  }
  return { status: 'success' }
}
