import { prisma } from '@/lib/db'

/**
 * Automation gates for the notification pipeline (docs/25 Part 4 go-live control). These are the
 * feature switches — deliberately SEPARATE from `RESEND_API_KEY`. Adding a Resend key so quotes or
 * password resets can send must NOT silently switch on client payment reminders: whether we CREATE and
 * attempt client notifications is governed here; whether the provider can actually deliver is governed
 * by the key. Both must be true to email a client.
 *
 * Stored in `Company.settings.automation` (JSON, no migration). Everything defaults OFF, so a fresh
 * deploy is inert: the scanner records nothing and nothing accumulates to burst-send later.
 */
export type AutomationSettings = {
  /** Auto client-facing emails: payment/shoot reminders and invoice-issued notices. */
  clientEmailsEnabled: boolean
  /** Internal +7 overdue follow-up tasks for staff. */
  internalFollowupsEnabled: boolean
  /** Only auto-act on instalments due on/after this date — so turning it on never backfills old
   *  overdue invoices. null = no date floor (rely on the one-milestone-per-instalment bound). */
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

/**
 * Merge a patch into `Company.settings.automation`. This is the ONLY way automation turns on — a
 * deliberate, audited act, never a side effect of configuring the email provider. (No UI yet; callable
 * from an admin action or an enablement script.)
 */
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
