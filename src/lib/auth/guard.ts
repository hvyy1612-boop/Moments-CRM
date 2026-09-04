import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { SESSION_COOKIE, validateSession } from './session'
import { ROUTE_PERMISSIONS, type Role } from './permissions'

/**
 * Server-side authorisation for staff pages and actions (SEC-A01, §5).
 *
 * The user shape handed to pages carries no secrets: passwordHash never leaves the auth layer
 * (SEC-P03, SEC-A11) because the Prisma select here simply never reads it.
 */
export type SessionUser = { id: string; email: string; name: string; role: Role; mustChangePassword: boolean }

/** Resolve the session cookie to an active user, or null. Never throws for a bad cookie. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return null
  const session = await validateSession(token)
  if (!session) return null
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, name: true, role: true, isActive: true, mustChangePassword: true },
  })
  if (!user || !user.isActive) return null
  return { id: user.id, email: user.email, name: user.name, role: user.role, mustChangePassword: user.mustChangePassword }
}

/**
 * Deny-by-default gate for a staff route (SEC-A01). The route must be declared with a roles list
 * in ROUTE_PERMISSIONS and the signed-in user's role must be in it.
 *
 * The two failures are deliberately different (D-024):
 * - Nobody signed in: go to /login, because signing in is what the visitor needs to do.
 * - Signed in but the wrong role: 404, not a redirect. Bouncing an authenticated user back to
 *   /login would loop straight to the dashboard and say nothing, and confirming "this exists but
 *   is not yours" tells a signed-in user which areas exist (SEC-A07).
 */
export async function requireRole(routeId: string): Promise<SessionUser> {
  const permission = ROUTE_PERMISSIONS[routeId]
  if (!permission || !('roles' in permission)) {
    // A programming error, not a request error: the §12.6 audit should make this unreachable.
    throw new Error(`Route ${routeId} has no role declaration (SEC-A01)`)
  }
  const user = await getSessionUser()
  if (!user) redirect('/login')
  // First login on an admin-created account: force the password change before anything else. The
  // /change-password page authenticates with getSessionUser (not requireRole), so it never loops.
  if (user.mustChangePassword && routeId !== '/change-password') redirect('/change-password')
  if (!permission.roles.includes(user.role)) notFound()
  return user
}
