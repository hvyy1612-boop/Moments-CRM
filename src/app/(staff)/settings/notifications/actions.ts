'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { can } from '@/lib/auth/authz'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { getActionUser } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { sydneyLocalToUtc } from '@/lib/time'
import { setAutomationSettings } from '@/lib/domain/automation'

export async function updateAutomationSettingsAction(formData: FormData): Promise<void> {
  const user = await getActionUser()
  if (!can(user, 'SETTINGS_EDIT')) return
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value
  if (!verifyCsrf(cookieValue, formData.get('csrf'))) return

  const company = await prisma.company.findFirst({ select: { id: true } })
  if (!company) return

  const fromRaw = String(formData.get('remindersActiveFrom') ?? '').trim()
  let remindersActiveFrom: Date | null = null
  if (fromRaw) {
    const parsed = sydneyLocalToUtc(`${fromRaw}T00:00`)
    if (!Number.isNaN(parsed.getTime())) remindersActiveFrom = parsed
  }

  try {
    await setAutomationSettings(
      company.id,
      {
        clientEmailsEnabled: formData.get('clientEmailsEnabled') === 'on',
        internalFollowupsEnabled: formData.get('internalFollowupsEnabled') === 'on',
        remindersActiveFrom,
      },
      user?.id ?? null,
    )
  } catch {
    revalidatePath('/settings/notifications')
    redirect('/settings/notifications?err=1')
  }
  revalidatePath('/settings/notifications')
  redirect('/settings/notifications?saved=1')
}
