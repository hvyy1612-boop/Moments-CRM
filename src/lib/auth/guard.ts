import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { SESSION_COOKIE, validateSession } from './session'
import { ROUTE_PERMISSIONS, type Role } from './permissions'

export type SessionUser = { id: string; email: string; name: string; role: Role }

export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return null
  const session = await validateSession(token)
  if (!session) return null
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  })
  if (!user || !user.isActive) return null
  return { id: user.id, email: user.email, name: user.name, role: user.role }
}

export async function requireRole(routeId: string): Promise<SessionUser> {
  const permission = ROUTE_PERMISSIONS[routeId]
  if (!permission || !('roles' in permission)) {

    throw new Error(`Route ${routeId} has no role declaration (SEC-A01)`)
  }
  const user = await getSessionUser()
  if (!user) redirect('/login')
  if (!permission.roles.includes(user.role)) notFound()
  return user
}
