import { prisma } from '@/lib/db'

export type AutomationSettings = {

  clientEmailsEnabled: boolean

  internalFollowupsEnabled: boolean

  remindersActiveFrom: Date | null
}

export const AUTOMATION_DEFAULTS: AutomationSettings = {
  clientEmailsEnabled: false,
  internalFollowupsEnabled: false,
  remindersActiveFrom: null,
}

export function readAutomationSettings(settings: unknown): AutomationSettings {
  const s = settings && typeof settings === 'object' && !Array.isArray(settings) ? (settings as Record<string, unknown>) : {}
  const a = s.automation && typeof s.automation === 'object' && !Array.isArray(s.automation) ? (s.automation as Record<string, unknown>) : {}
  const fromRaw = typeof a.remindersActiveFrom === 'string' ? new Date(a.remindersActiveFrom) : null
  return {
    clientEmailsEnabled: a.clientEmailsEnabled === true,
    internalFollowupsEnabled: a.internalFollowupsEnabled === true,
    remindersActiveFrom: fromRaw && !Number.isNaN(fromRaw.getTime()) ? fromRaw : null,
  }
}

export async function getAutomationSettings(companyId: string): Promise<AutomationSettings> {
  const c = await prisma.company.findUnique({ where: { id: companyId }, select: { settings: true } })
  return readAutomationSettings(c?.settings)
}

export async function setAutomationSettings(
  companyId: string,
  patch: Partial<AutomationSettings>,
  actorUserId: string | null = null,
): Promise<AutomationSettings> {
  return prisma.$transaction(async (tx) => {
    const c = await tx.company.findUnique({ where: { id: companyId }, select: { settings: true } })
    if (!c) throw new Error('Company not found.')
    const current = readAutomationSettings(c.settings)
    const next: AutomationSettings = { ...current, ...patch }
    const base = c.settings && typeof c.settings === 'object' && !Array.isArray(c.settings) ? (c.settings as Record<string, unknown>) : {}
    await tx.company.update({
      where: { id: companyId },
      data: {
        settings: {
          ...base,
          automation: {
            clientEmailsEnabled: next.clientEmailsEnabled,
            internalFollowupsEnabled: next.internalFollowupsEnabled,
            remindersActiveFrom: next.remindersActiveFrom ? next.remindersActiveFrom.toISOString() : null,
          },
        } as object,
      },
    })
    await tx.auditLog.create({
      data: { companyId, action: 'automation.settings_changed', entityType: 'Company', entityId: companyId, actorUserId, afterData: patch as object },
    })
    return next
  })
}
