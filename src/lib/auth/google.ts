import { createHash, randomBytes } from 'node:crypto'
import { CodeChallengeMethod, OAuth2Client } from 'google-auth-library'
import { env } from '@/lib/env'

export const OAUTH_STATE_COOKIE = 'moments_g_state'
export const OAUTH_VERIFIER_COOKIE = 'moments_g_verifier'
export const OAUTH_TEMP_MAX_AGE = 10 * 60

const SCOPES = ['openid', 'email', 'profile']

function creds(): { clientId: string; clientSecret: string } {
  const clientId = env.GOOGLE_CLIENT_ID
  const clientSecret = env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) throw new Error('Google sign-in is not configured')
  return { clientId, clientSecret }
}

export function googleCallbackUrl(origin: string): string {
  return `${origin}/api/auth/google/callback`
}

export function googleClient(redirectUri: string): OAuth2Client {
  const { clientId, clientSecret } = creds()
  return new OAuth2Client({ clientId, clientSecret, redirectUri })
}

export function newOAuthState(): string {
  return randomBytes(32).toString('base64url')
}

export function newPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

export function googleAuthUrl(client: OAuth2Client, state: string, challenge: string): string {
  return client.generateAuthUrl({
    access_type: 'online', // no refresh token is issued; we never store one (BR-G03)
    scope: SCOPES,
    state,
    code_challenge_method: CodeChallengeMethod.S256,
    code_challenge: challenge,
    prompt: 'select_account',
  })
}

export type GoogleIdentity = { sub: string; email: string; emailVerified: boolean; name: string | null }

export async function exchangeGoogleCode(
  client: OAuth2Client,
  code: string,
  verifier: string,
): Promise<GoogleIdentity | null> {
  try {
    const { tokens } = await client.getToken({ code, codeVerifier: verifier })
    if (!tokens.id_token) return null
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: creds().clientId })
    const payload = ticket.getPayload()
    if (!payload?.sub || !payload.email) return null
    return {
      sub: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified === true,
      name: payload.name ?? null,
    }
  } catch {
    return null
  }
}
