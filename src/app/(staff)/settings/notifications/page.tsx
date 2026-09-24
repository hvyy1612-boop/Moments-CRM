import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { emailProviderReady } from '@/lib/env'
import { sydneyDateTimeParts } from '@/lib/time'
import { getAutomationSettings } from '@/lib/domain/automation'
import { scanPaymentReminders, type ReminderImpactItem } from '@/lib/domain/notifications'
import { PageHeader } from '@/components/PageHeader'
import { BackLink } from '@/components/BackLink'
import { Button } from '@/components/ui/Button'
import { Checkbox, TextInput } from '@/components/ui/form'
import { StatusPill, type Tone } from '@/components/ui/StatusPill'
import { AppShell } from '../../AppShell'
import { PageContainer } from '@/components/PageContainer'
import { updateAutomationSettingsAction } from './actions'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Notifications - Moments' }

/**
 * Notification automation go-live control (docs/25 Part 4). Two independent gates decide whether a client
 * reminder is actually sent: (1) this per-company automation switch, and (2) the email provider key. Both
 * must be on. Everything defaults OFF so a fresh deploy is inert. The "impact preview" runs the real
 * reminder scan in preview mode (writes nothing) so an admin sees exactly what a live run would do before
 * switching automation on for the first time.
 */

type ReminderItem = Extract<ReminderImpactItem, { type: 'reminder' }>
type FollowupItem = Extract<ReminderImpactItem, { type: 'followup' }>

export default async function NotificationsSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ saved?: string; err?: string }>
}) {
  const user = await requireRole('/settings/notifications')
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''
  const sp = (await searchParams) ?? {}

  const company = await prisma.company.findFirst({ select: { id: true } })
  const settings = company ? await getAutomationSettings(company.id) : null
  const activeFrom = settings?.remindersActiveFrom ? sydneyDateTimeParts(settings.remindersActiveFrom).date : ''

  // Real reminder scan in PREVIEW mode only: computes the full impact list and WRITES NOTHING. Never run
  // the live scan from a page render - that would enqueue sends as a side effect of viewing settings.
  const { impact: items } = await scanPaymentReminders(new Date(), { preview: true })
  const reminders = items.filter((i): i is ReminderItem => i.type === 'reminder')
  const followups = items.filter((i): i is FollowupItem => i.type === 'followup')

  const invoiceIds = [...new Set(items.map((i) => i.invoiceId))]
  const invoiceRows = invoiceIds.length
    ? await prisma.invoice.findMany({ where: { id: { in: invoiceIds } }, select: { id: true, invoiceNumber: true } })
    : []
  const invoiceNumber = new Map(invoiceRows.map((r) => [r.id, r.invoiceNumber]))

  const clientOn = settings?.clientEmailsEnabled ?? false
  const followupsOn = settings?.internalFollowupsEnabled ?? false

  // A reminder truly sends only when automation is on AND the provider is configured (two gates).
  const reminderState = (): { tone: Tone; label: string } => {
    if (!clientOn) return { tone: 'neutral', label: 'Automation off' }
    if (!emailProviderReady) return { tone: 'warn', label: 'Blocked: no email provider' }
    return { tone: 'good', label: 'Would send' }
  }
  const followupState: { tone: Tone; label: string } = followupsOn
    ? { tone: 'good', label: 'Would open task' }
    : { tone: 'neutral', label: 'Automation off' }

  return (
    <AppShell user={user} csrf={csrf} active="settings">
      <PageContainer variant="narrow">
      <BackLink href="/settings" label="Settings" />
      <PageHeader
        eyebrow="System"
        title="Notifications"
        description="Automatic client reminders and internal follow-ups. Both gates below must be on before any client email is sent; everything starts off, so nothing sends until you deliberately turn it on."
      />

      {sp.saved ? (
        <div className="mb-4 rounded-md border border-ok bg-paper px-3 py-2 text-sm text-ok">Notification settings saved.</div>
      ) : null}
      {sp.err ? (
        <div className="mb-4 rounded-md border border-danger bg-paper px-3 py-2 text-sm text-danger">Could not save. Refresh and try again.</div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Gate 1 - the automation switches (this page writes them; audited). */}
        <form action={updateAutomationSettingsAction} className="rounded-md border border-line bg-surface p-5">
          <input type="hidden" name="csrf" value={csrf} />
          <h2 className="mb-1 text-sm font-bold text-ink">Automation switches</h2>
          <p className="mb-4 text-sm text-ink-muted">These are separate from the email provider key: turning them on decides whether reminders are created and attempted.</p>

          <div className="flex flex-col gap-4">
            <div>
              <Checkbox id="clientEmailsEnabled" name="clientEmailsEnabled" defaultChecked={clientOn} label="Send client payment reminders automatically" />
              <p className="ml-6 mt-0.5 text-xs text-muted">Payment reminders at each overdue milestone. Also needs the email provider (below) to actually deliver.</p>
            </div>
            <div>
              <Checkbox id="internalFollowupsEnabled" name="internalFollowupsEnabled" defaultChecked={followupsOn} label="Open internal follow-up tasks for overdue invoices" />
              <p className="ml-6 mt-0.5 text-xs text-muted">A staff task at +7 days overdue, auto-resolved when the balance clears. Internal only - never emails the client.</p>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-ink">Only act on instalments due on/after</span>
              <TextInput type="date" name="remindersActiveFrom" defaultValue={activeFrom} className="max-w-xs" />
              <span className="text-xs text-muted">Prevents backfilling old overdue invoices when you first switch on. Leave blank for no date floor.</span>
            </label>
          </div>

          <div className="mt-5"><Button type="submit">Save settings</Button></div>
        </form>

        {/* Gate 2 - provider readiness (read-only; set by environment, not here). */}
        <div className="rounded-md border border-line bg-surface p-5">
          <h2 className="mb-1 text-sm font-bold text-ink">Email provider</h2>
          <p className="mb-4 text-sm text-ink-muted">The delivery channel (Resend). Configured with environment variables, not on this page.</p>
          <div className="flex items-center justify-between gap-3 border-t border-line py-3">
            <span className="text-sm text-ink">Provider configured</span>
            {emailProviderReady ? <StatusPill tone="good">Ready</StatusPill> : <StatusPill tone="warn">Not configured</StatusPill>}
          </div>
          {!emailProviderReady ? (
            <p className="mt-2 text-xs text-muted">Client reminders will be held (not sent, never faked) until RESEND_API_KEY and EMAIL_FROM are set. Internal follow-up tasks do not need the provider.</p>
          ) : null}
        </div>
      </div>

      {/* The impact preview: exactly what a live run would do right now, computed without writing anything. */}
      <section className="mt-4 rounded-md border border-line bg-surface p-5">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-ink">Impact preview</h2>
          <span className="text-sm text-muted">{reminders.length} reminder{reminders.length === 1 ? '' : 's'} · {followups.length} follow-up{followups.length === 1 ? '' : 's'}</span>
        </div>
        <p className="mb-4 text-sm text-ink-muted">A dry run of the reminder scan against today&rsquo;s unpaid instalments. Nothing here is sent or created - it shows what a live run would do with the switches above.</p>

        {reminders.length === 0 && followups.length === 0 ? (
          <p className="rounded-md border border-dashed border-line bg-paper px-4 py-6 text-center text-sm text-ink-muted">Nothing is due for a reminder right now.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-4 font-medium">Invoice</th>
                  <th className="py-2 pr-4 font-medium">Action</th>
                  <th className="py-2 pr-4 font-medium">To</th>
                  <th className="py-2 pr-4 font-medium">Amount</th>
                  <th className="py-2 font-medium">Outcome now</th>
                </tr>
              </thead>
              <tbody>
                {reminders.map((r, idx) => {
                  const s = reminderState()
                  return (
                    <tr key={`r-${r.invoiceId}-${r.milestone}-${idx}`} className="border-b border-line">
                      <td className="py-2 pr-4 text-ink">{invoiceNumber.get(r.invoiceId) ?? r.invoiceId}</td>
                      <td className="py-2 pr-4 text-ink-muted">Payment reminder</td>
                      <td className="py-2 pr-4 text-ink-muted">{r.recipientEmail}</td>
                      <td className="py-2 pr-4 tabular-nums text-ink">${r.amount}</td>
                      <td className="py-2"><StatusPill tone={s.tone}>{s.label}</StatusPill></td>
                    </tr>
                  )
                })}
                {followups.map((f, idx) => (
                  <tr key={`f-${f.invoiceId}-${idx}`} className="border-b border-line">
                    <td className="py-2 pr-4 text-ink">{invoiceNumber.get(f.invoiceId) ?? f.invoiceId}</td>
                    <td className="py-2 pr-4 text-ink-muted">Internal follow-up task</td>
                    <td className="py-2 pr-4 text-ink-muted">Staff</td>
                    <td className="py-2 pr-4 text-ink-muted">-</td>
                    <td className="py-2"><StatusPill tone={followupState.tone}>{followupState.label}</StatusPill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </PageContainer>
    </AppShell>
  )
}
