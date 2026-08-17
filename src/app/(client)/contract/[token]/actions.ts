'use server'

import { cookies } from 'next/headers'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { signContractByToken } from '@/lib/domain/contract'
import { requestMeta } from '@/lib/http'
import { signContractSchema } from '@/lib/validation/contract'

export type SignState =
  | { status: 'idle' }
  | { status: 'success' }
  | { status: 'error'; message: string }

export async function signContract(_prev: SignState, formData: FormData): Promise<SignState> {
  const cookieStore = await cookies()
  if (!verifyCsrf(cookieStore.get(CSRF_COOKIE)?.value, formData.get('csrf'))) {
    return { status: 'error', message: 'Your session expired. Refresh and try again.' }
  }
  const token = String(formData.get('token') ?? '')
  const parsed = signContractSchema.safeParse({ signedName: formData.get('signedName') })
  if (!parsed.success) {
    return {
      status: 'error',
      message: parsed.error.issues[0]?.message ?? 'Type your full name to sign.',
    }
  }
  const meta = await requestMeta()
  try {
    await signContractByToken(token, parsed.data.signedName, meta.ipAddress)
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : 'Could not sign.' }
  }
  return { status: 'success' }
}
