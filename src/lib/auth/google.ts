import { createHash, randomBytes } from 'node:crypto'
import { CodeChallengeMethod, OAuth2Client } from 'google-auth-library'
import { env } from '@/lib/env'

/**
 * Google staff sign-in helper (§8.5, BR-G). We only ever request the identity scopes - never Gmail,
 * Drive or Calendar (BR-G04) - and store only the account's stable subject id, never any token
 * (BR-G03). The OAuth state and the PKCE verifier (BR-G09) travel in two short-lived cookies that -
 * critically - use sameSite=lax so the browser still sends them on the top-level redirect back from
 * Google; sameSite=strict would drop them and break every sign-in.
 */
export const OAUTH_STATE_COOKIE = 'moments_g_state'
export const OAUTH_VERIFIER_COOKIE = 'moments_g_verifier'
export const OAUTH_TEMP_MAX_AGE = 10 * 60 // seconds allowed to complete the round trip

const SCOPES = ['openid', 'email', 'profile']

function creds(): { clientId: string; clientSecret: string } {
  const clientId = env.GOOGLE_CLIENT_ID
  const clientSecret = env.GOOGLE_CLIENT_SECRET
  // Callers gate on googleEnabled, so this only trips on a misconfiguration.
  if (!clientId || !clientSecret) throw new Error('Google sign-in is not configured')
  return { clientId, clientSecret }
}

/**
 * The callback URL, derived from the live request origin so localhost and the deployed host each use
 * the redirect URI registered for them in Google Cloud - no extra env var to keep in sync.
 */
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

/** PKCE (BR-G09): a high-entropy verifier and its S256 challenge. */
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

/**
 * Exchange the authorization code (with the PKCE verifier) for tokens, then verify the returned ID
 * token against Google's certificates (signature, audience, issuer, expiry). Returns the verified
 * identity, or null if the exchange or verification fails.
 */
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
