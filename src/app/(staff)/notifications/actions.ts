'use server'

import { getSessionUser } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'

export async function markNotificationsReadAction() {
  const user = await getSessionUser()
  if (!user) return
  await prisma.user.update({ where: { id: user.id }, data: { notificationsSeenAt: new Date() } })
}
