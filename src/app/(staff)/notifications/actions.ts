'use server'

import { getSessionUser } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'

/**
 * Mark all notifications as read for the current user. The bell's unread count is "alerts newer than
 * this marker", so setting it to now clears the badge. There is no per-notification row to flag - a
 * single per-user timestamp is the whole read state (see User.notificationsSeenAt). The UI clears
 * optimistically; the staff shell is dynamic (cookie-based), so the next render re-reads this marker -
 * no revalidate needed (and a layout-wide revalidate would churn/close the open panel).
 */
export async function markNotificationsReadAction() {
  const user = await getSessionUser()
  if (!user) return
  await prisma.user.update({ where: { id: user.id }, data: { notificationsSeenAt: new Date() } })
}
