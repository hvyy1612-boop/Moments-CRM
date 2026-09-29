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
import { DASHBOARD_CRUMB } from '@/components/Breadcrumb'
import { Button } from '@/components/ui/Button'
import { Checkbox, Field, FormActions, FormBlock, FormCell, PageForm, TextInput } from '@/components/ui/form'
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
      <PageContainer variant="standard">
      <PageHeader
        breadcrumb={[DASHBOARD_CRUMB, { label: 'Settings', href: '/settings' }, { label: 'Notifications' }]}
        title="Notifications"
      />

      {sp.saved ? (
        <div className="mb-4 rounded-md border border-ok bg-paper px-3 py-2 text-sm text-ok">Notification settings saved.</div>
      ) : null}
      {sp.err ? (
        <div className="mb-4 rounded-md border border-danger bg-paper px-3 py-2 text-sm text-danger">Could not save. Refresh and try again.</div>
      ) : null}

      {/* Gate 1 - the automation switches (this page writes them; audited). Carbon page-form layout. */}
      <form action={updateAutomationSettingsAction} className="mt-8">
        <input type="hidden" name="csrf" value={csrf} />
        <PageForm>
          <FormBlock
            title="Automation switches"
            description="These switches decide whether reminders and follow-ups run at all. Client emails also need the email provider (below) to be ready before anything is actually sent."
          >
            <FormCell>
              <Checkbox id="clientEmailsEnabled" name="clientEmailsEnabled" defaultChecked={clientOn} label="Send client payment reminders automatically" />
              <p className="ml-6 mt-0.5 text-xs text-muted">Sends a reminder each time a payment becomes overdue. The email provider below must be ready for these to actually send.</p>
            </FormCell>
            <FormCell>
              <Checkbox id="internalFollowupsEnabled" name="internalFollowupsEnabled" defaultChecked={followupsOn} label="Open internal follow-up tasks for overdue invoices" />
              <p className="ml-6 mt-0.5 text-xs text-muted">Creates a staff to-do once an invoice is 7 days overdue. It clears itself when the balance is paid. Internal only; it never emails the client.</p>
            </FormCell>
            <FormCell span={4}>
              <Field
                label="Only act on instalments due on/after"
                htmlFor="remindersActiveFrom"
                hint="Stops old overdue invoices from being picked up when you first switch this on. Leave blank to include every date."
              >
                <TextInput id="remindersActiveFrom" type="date" name="remindersActiveFrom" defaultValue={activeFrom} />
              </Field>
            </FormCell>
          </FormBlock>
          <FormActions>
            <Button type="submit">Save settings</Button>
          </FormActions>
        </PageForm>
      </form>

      <PageForm className="mt-8 border-t border-line pt-8">
        {/* Gate 2 - provider readiness (read-only; set by environment, not here). */}
        <FormBlock title="Email provider" description="The service that actually sends your emails (Resend). It is set up behind the scenes, not on this page.">
          <FormCell span={8}>
            <div className="flex items-center justify-between gap-3 border-y border-line py-3">
              <span className="text-sm text-ink">Provider configured</span>
              {emailProviderReady ? <StatusPill tone="good">Ready</StatusPill> : <StatusPill tone="warn">Not configured</StatusPill>}
            </div>
            {!emailProviderReady ? (
              <p className="mt-2 text-xs text-muted">Client reminders are held until the email provider is connected, and are never sent before then. Internal follow-up tasks do not need the email provider.</p>
            ) : null}
          </FormCell>
        </FormBlock>

        {/* The impact preview: exactly what a live run would do right now, computed without writing anything. */}
        <FormBlock
          title="Impact preview"
          description="A preview of which reminders would go out today, based on the unpaid instalments. Nothing is sent or created here; it only shows what would happen with the settings above."
        >
          <FormCell>
        <p className="mb-3 text-sm text-muted">{reminders.length} reminder{reminders.length === 1 ? '' : 's'} · {followups.length} follow-up{followups.length === 1 ? '' : 's'}</p>

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
          </FormCell>
        </FormBlock>
      </PageForm>
    </PageContainer>
    </AppShell>
  )
}
