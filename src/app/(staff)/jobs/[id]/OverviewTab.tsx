'use client'

import { useState } from 'react'
import {
  addInternalNoteAction,
  addMessageToRequirementsAction,
  addRequirementAction,
  addTeamMemberAction,
  deleteRequirementAction,
  editInternalNoteAction,
  logProjectClientReplyAction,
  removeTeamMemberAction,
  updateClientContactAction,
} from '../actions'
import {
  IconArrowRight,
  IconCalendar,
  IconChat,
  IconChecklist,
  IconChevronRight,
  IconClient,
  IconExternal,
  IconFolder,
  IconMail,
  IconPhone,
  IconPlus,
  IconReceipt,
  IconUsers,
} from './icons'

export type ReqRow = { id: string; label: string; detail: string }
export type TeamRow = { id: string; name: string; role: string; email: string | null }
export type ResourceOpt = { id: string; name: string }
export type NextAction =
  | { kind: 'task'; title: string; dueLabel: string | null; owner: string | null; needsAttention: boolean }
  | { kind: 'waiting'; label: string }
  | null
export type ClientInfo = {
  clientId: string
  displayName: string
  partnerName: string | null
  phone: string | null
  email: string
  preferredContact: string | null
  address: string | null
  instagram: string | null
  clientSince: string
  notes: string | null
  href: string
}
export type Upcoming = {
  nextAction: NextAction
  shootLabel: string | null
  shootLocation: string | null
  paymentLabel: string
  paymentSub: string | null
  deliveryLabel: string
  deliverySub: string | null
}
export type MsgRow = { id: string; author: string; body: string; dateLabel: string; inbound: boolean }
export type NoteRow = { id: string; author: string; body: string; dateLabel: string; editedByName: string | null; editedLabel: string | null }
export type TabHrefs = { workflow: string; shoot: string; finance: string; files: string }

const field = 'w-full rounded border border-line-strong bg-surface px-3 py-2 text-sm text-ink'
const btnPrimary = 'rounded bg-ink px-3 py-1.5 text-sm font-bold text-surface'
const btnGhost = 'rounded px-3 py-1.5 text-sm font-bold text-muted hover:text-ink'
const linkBtn = 'inline-flex items-center gap-1 text-sm font-bold text-accent-ink hover:underline'

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?'
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sunk text-xs font-bold text-ink-muted">
      {initials(name)}
    </span>
  )
}

function Card({
  icon,
  title,
  subtitle,
  action,
  className = '',
  children,
}: {
  icon: React.ReactNode
  title: string
  subtitle?: string
  action?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={`flex h-full flex-col rounded border border-line bg-surface p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 text-ink-muted">{icon}</span>
          <div>
            <h2 className="text-lg font-semibold text-ink">{title}</h2>
            {subtitle ? <p className="text-sm text-muted">{subtitle}</p> : null}
          </div>
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

export function OverviewTab({
  projectId,
  csrf,
  client,
  requirements,
  team,
  resources,
  upcoming,
  messages,
  notes,
  hrefs,
}: {
  projectId: string
  csrf: string
  client: ClientInfo
  requirements: ReqRow[]
  team: TeamRow[]
  resources: ResourceOpt[]
  upcoming: Upcoming
  messages: MsgRow[]
  notes: NoteRow[]
  hrefs: TabHrefs
}) {
  const [addReq, setAddReq] = useState(false)
  const [editTeam, setEditTeam] = useState(false)
  const [editContact, setEditContact] = useState(false)
  const [activityTab, setActivityTab] = useState<'messages' | 'notes'>('messages')
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [addingMessage, setAddingMessage] = useState(false)
  const [addingNote, setAddingNote] = useState(false)

  const hidden = (
    <>
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="projectId" value={projectId} />
    </>
  )

  return (
    <div className="flex flex-col gap-4">
      {/* Four cards in two aligned rows (requirements|client info, team|upcoming). */}
      <div className="grid gap-4 lg:grid-cols-5 lg:items-stretch">
        {/* Client requirements */}
        <Card
          className="lg:col-span-3"
          icon={<IconChecklist className="h-5 w-5" />}
          title="Client requirements"
          subtitle="Confirmed preferences, requests and restrictions for this job."
          action={
            <button type="button" onClick={() => setAddReq((v) => !v)} className="inline-flex items-center gap-1 rounded border border-line-strong px-2.5 py-1.5 text-sm font-bold text-ink-muted hover:text-ink">
              <IconPlus className="h-4 w-4" /> Add requirement
            </button>
          }
        >
          {addReq ? (
            <form action={addRequirementAction} className="mb-4 flex flex-col gap-2 rounded border border-accent bg-paper p-3">
              {hidden}
              <input name="label" required placeholder="Requirement (e.g. Photography style)" className={field} />
              <textarea name="detail" required placeholder="Details..." rows={2} className={field} />
              <div className="flex gap-2">
                <button type="submit" className={btnPrimary} onClick={() => setAddReq(false)}>Add</button>
                <button type="button" onClick={() => setAddReq(false)} className={btnGhost}>Cancel</button>
              </div>
            </form>
          ) : null}

          {requirements.length === 0 ? (
            <p className="text-sm text-ink-muted">No requirements recorded yet.</p>
          ) : (
            <dl className="flex flex-col divide-y divide-line">
              {requirements.map((r) => (
                <div key={r.id} className="group flex items-start justify-between gap-4 py-2.5 first:pt-0">
                  <div className="flex flex-1 flex-col gap-1 sm:flex-row sm:gap-4">
                    <dt className="text-sm font-bold text-ink sm:w-40 sm:shrink-0">{r.label}</dt>
                    <dd className="text-sm text-ink-muted">{r.detail}</dd>
                  </div>
                  <form action={deleteRequirementAction} className="opacity-0 transition-opacity group-hover:opacity-100">
                    {hidden}
                    <input type="hidden" name="requirementId" value={r.id} />
                    <button type="submit" aria-label="Remove requirement" className="text-sm text-muted hover:text-lost-ink">Remove</button>
                  </form>
                </div>
              ))}
            </dl>
          )}
        </Card>

        {/* Client information */}
        <Card
          className="lg:col-span-2"
          icon={<IconClient className="h-5 w-5" />}
          title="Client information"
          subtitle="Contact details and key information."
          action={
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setEditContact((v) => !v)} className={btnGhost}>Edit</button>
              <a href={client.href} className={linkBtn}>View full client <IconArrowRight className="h-4 w-4" /></a>
            </div>
          }
        >
          {editContact ? (
            <form action={updateClientContactAction} className="mb-4 flex flex-col gap-2 rounded border border-accent bg-paper p-3">
              {hidden}
              <input type="hidden" name="clientId" value={client.clientId} />
              <input name="partnerName" defaultValue={client.partnerName ?? ''} placeholder="Partner" className={field} />
              <input name="phone" defaultValue={client.phone ?? ''} placeholder="Phone" className={field} />
              <input name="preferredContact" defaultValue={client.preferredContact ?? ''} placeholder="Preferred contact (e.g. Email)" className={field} />
              <input name="instagram" defaultValue={client.instagram ?? ''} placeholder="Instagram handle" className={field} />
              <textarea name="notes" defaultValue={client.notes ?? ''} placeholder="Notes" rows={2} className={field} />
              <div className="flex gap-2">
                <button type="submit" className={btnPrimary} onClick={() => setEditContact(false)}>Save</button>
                <button type="button" onClick={() => setEditContact(false)} className={btnGhost}>Cancel</button>
              </div>
            </form>
          ) : null}

          <dl className="flex flex-col gap-2.5 text-sm">
            <InfoRow label="Primary contact" value={client.displayName} />
            <InfoRow label="Partner" value={client.partnerName} />
            <div className="flex items-start justify-between gap-3">
              <dt className="text-ink-muted">Phone</dt>
              <dd className="flex items-center gap-2 text-right text-ink">
                {client.phone ?? 'Not given'}
                {client.phone ? (
                  <span className="flex items-center gap-1.5 text-ink-muted">
                    <a href={`tel:${client.phone}`} aria-label="Call"><IconPhone className="h-4 w-4" /></a>
                    <a href={`sms:${client.phone}`} aria-label="Message"><IconChat className="h-4 w-4" /></a>
                  </span>
                ) : null}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-ink-muted">Email</dt>
              <dd className="flex min-w-0 items-center gap-2 text-right text-ink">
                <span className="truncate">{client.email}</span>
                <a href={`mailto:${client.email}`} aria-label="Email" className="shrink-0 text-ink-muted"><IconMail className="h-4 w-4" /></a>
              </dd>
            </div>
            <InfoRow label="Preferred contact" value={client.preferredContact} />
            <InfoRow label="Address" value={client.address} />
            <div className="flex items-start justify-between gap-3">
              <dt className="text-ink-muted">Instagram</dt>
              <dd className="flex items-center gap-2 text-right text-ink">
                {client.instagram ? (
                  <>
                    <span>@{client.instagram.replace(/^@/, '')}</span>
                    <a href={`https://instagram.com/${client.instagram.replace(/^@/, '')}`} target="_blank" rel="noreferrer" aria-label="Open Instagram" className="text-ink-muted"><IconExternal className="h-4 w-4" /></a>
                  </>
                ) : (
                  <span className="text-muted">Not given</span>
                )}
              </dd>
            </div>
            <InfoRow label="Client since" value={client.clientSince} />
            <InfoRow label="Notes" value={client.notes} />
          </dl>
        </Card>

        {/* Assigned team (no avatars) */}
        <Card
          className="lg:col-span-3"
          icon={<IconUsers className="h-5 w-5" />}
          title="Assigned team"
          subtitle="People responsible for this job."
          action={
            <button type="button" onClick={() => setEditTeam((v) => !v)} className="inline-flex items-center gap-1 rounded border border-line-strong px-2.5 py-1.5 text-sm font-bold text-ink-muted hover:text-ink">
              <IconPlus className="h-4 w-4" /> Add member
            </button>
          }
        >
          {editTeam ? (
            <form action={addTeamMemberAction} className="mb-4 flex flex-col gap-2 rounded border border-accent bg-paper p-3">
              {hidden}
              <div className="flex flex-wrap gap-2">
                {resources.length > 0 ? (
                  <select name="resourceId" defaultValue="" className={`${field} flex-1`}>
                    <option value="">Select a person...</option>
                    {resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                ) : (
                  <input name="name" placeholder="Name" className={`${field} flex-1`} />
                )}
                <input name="role" required placeholder="Role (e.g. Lead Photographer)" className={`${field} flex-1`} />
              </div>
              {resources.length > 0 ? <input name="name" placeholder="Or type a name (if not listed)" className={field} /> : null}
              <div className="flex gap-2">
                <button type="submit" className={btnPrimary} onClick={() => setEditTeam(false)}>Add</button>
                <button type="button" onClick={() => setEditTeam(false)} className={btnGhost}>Cancel</button>
              </div>
            </form>
          ) : null}

          {team.length === 0 ? (
            <p className="text-sm text-ink-muted">No team assigned yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {team.map((m) => (
                <li key={m.id} className="group flex items-center justify-between gap-3 py-2.5 first:pt-0">
                  <div>
                    <p className="text-sm font-bold text-ink">{m.name}</p>
                    <p className="text-sm text-muted">{m.role}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {m.email ? (
                      <a href={`mailto:${m.email}`} aria-label={`Email ${m.name}`} className="text-ink-muted hover:text-ink"><IconMail className="h-4 w-4" /></a>
                    ) : null}
                    <form action={removeTeamMemberAction} className="opacity-0 transition-opacity group-hover:opacity-100">
                      {hidden}
                      <input type="hidden" name="memberId" value={m.id} />
                      <button type="submit" className="text-sm text-muted hover:text-lost-ink">Remove</button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Upcoming summary: clickable rows into the relevant tab (image 34). */}
        <Card
          className="lg:col-span-2"
          icon={<IconCalendar className="h-5 w-5" />}
          title="Upcoming summary"
          subtitle="Next key actions, shoot details and payment."
          action={<a href={hrefs.workflow} className={linkBtn}>View workflow <IconArrowRight className="h-4 w-4" /></a>}
        >
          <div className="flex flex-col gap-2">
            <SummaryRow
              href={hrefs.workflow}
              icon={<IconChecklist className="h-4 w-4" />}
              title={upcoming.nextAction ? (upcoming.nextAction.kind === 'task' ? upcoming.nextAction.title : `Waiting on ${upcoming.nextAction.label}`) : 'All caught up'}
              sub={upcoming.nextAction && upcoming.nextAction.kind === 'task'
                ? [upcoming.nextAction.owner, upcoming.nextAction.dueLabel ? `Due ${upcoming.nextAction.dueLabel}` : null].filter(Boolean).join(' · ') || null
                : upcoming.nextAction && upcoming.nextAction.kind === 'waiting' ? 'Updates automatically' : null}
              danger={Boolean(upcoming.nextAction && upcoming.nextAction.kind === 'task' && upcoming.nextAction.needsAttention)}
            />
            <SummaryRow
              href={hrefs.shoot}
              icon={<IconCalendar className="h-4 w-4" />}
              title={upcoming.shootLabel ?? 'Not scheduled'}
              sub={upcoming.shootLocation}
            />
            <SummaryRow
              href={hrefs.finance}
              icon={<IconReceipt className="h-4 w-4" />}
              title={upcoming.paymentLabel}
              sub={upcoming.paymentSub}
            />
            <SummaryRow
              href={hrefs.files}
              icon={<IconFolder className="h-4 w-4" />}
              title={upcoming.deliveryLabel}
              sub={upcoming.deliverySub}
            />
          </div>
        </Card>
      </div>

      {/* Activity & communication (full width) */}
      <section className="rounded border border-line bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 text-ink-muted"><IconChat className="h-5 w-5" /></span>
            <div>
              <h2 className="text-lg font-semibold text-ink">Activity &amp; communication</h2>
              <p className="text-sm text-muted">Recent messages with the client and internal team notes.</p>
            </div>
          </div>
          <div className="inline-flex overflow-hidden rounded-md border border-line-strong">
            <button type="button" onClick={() => setActivityTab('messages')} className={`px-3 py-1.5 text-sm font-bold ${activityTab === 'messages' ? 'bg-ink text-surface' : 'bg-surface text-ink-muted hover:text-ink'}`}>
              Client messages ({messages.length})
            </button>
            <button type="button" onClick={() => setActivityTab('notes')} className={`px-3 py-1.5 text-sm font-bold ${activityTab === 'notes' ? 'bg-ink text-surface' : 'bg-surface text-ink-muted hover:text-ink'}`}>
              Internal notes ({notes.length})
            </button>
          </div>
        </div>

        <div className="mt-4">
          {activityTab === 'messages' ? (
            <>
              <ul className="flex flex-col divide-y divide-line">
                {messages.length === 0 ? <li className="py-2 text-sm text-ink-muted">No client messages yet.</li> : null}
                {messages.map((m) => (
                  <li key={m.id} className="group flex items-start gap-3 py-3 first:pt-0">
                    <Avatar name={m.author} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-sm font-bold text-ink">{m.author}</span>
                        <span className="text-xs text-muted">{m.dateLabel}</span>
                      </div>
                      <p className="mt-0.5 whitespace-pre-line text-sm text-ink">{m.body}</p>
                    </div>
                    <form action={addMessageToRequirementsAction} className="opacity-0 transition-opacity group-hover:opacity-100">
                      {hidden}
                      <input type="hidden" name="communicationId" value={m.id} />
                      <button type="submit" className="whitespace-nowrap text-sm font-bold text-accent-ink hover:underline">Add to requirements</button>
                    </form>
                  </li>
                ))}
              </ul>
              {addingMessage ? (
                <form action={logProjectClientReplyAction} onSubmit={() => setAddingMessage(false)} className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
                  {hidden}
                  <textarea name="body" required rows={2} autoFocus placeholder="Paste what the client said..." className={field} />
                  <div className="flex gap-2">
                    <button type="submit" className={btnPrimary}>Add message</button>
                    <button type="button" onClick={() => setAddingMessage(false)} className={btnGhost}>Cancel</button>
                  </div>
                </form>
              ) : (
                <button type="button" onClick={() => setAddingMessage(true)} className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-accent-ink hover:underline">
                  <IconPlus className="h-4 w-4" /> Add message
                </button>
              )}
            </>
          ) : (
            <>
              <ul className="flex flex-col divide-y divide-line">
                {notes.length === 0 ? <li className="py-2 text-sm text-ink-muted">No internal notes yet.</li> : null}
                {notes.map((n) => (
                  <li key={n.id} className="group flex items-start gap-3 py-3 first:pt-0">
                    <Avatar name={n.author} />
                    <div className="min-w-0 flex-1">
                      {editingNoteId === n.id ? (
                        <form action={editInternalNoteAction} className="flex flex-col gap-2" onSubmit={() => setEditingNoteId(null)}>
                          {hidden}
                          <input type="hidden" name="communicationId" value={n.id} />
                          <div className="flex flex-wrap items-baseline gap-x-2">
                            <span className="text-sm font-bold text-ink">{n.author}</span>
                            <span className="text-xs text-muted">{n.dateLabel}</span>
                          </div>
                          <textarea name="body" required rows={2} defaultValue={n.body} className={field} />
                          <div className="flex gap-2">
                            <button type="submit" className={btnPrimary}>Save</button>
                            <button type="button" onClick={() => setEditingNoteId(null)} className={btnGhost}>Cancel</button>
                          </div>
                        </form>
                      ) : (
                        <>
                          <div className="flex flex-wrap items-baseline gap-x-2">
                            <span className="text-sm font-bold text-ink">{n.author}</span>
                            <span className="text-xs text-muted">{n.dateLabel}</span>
                          </div>
                          <p className="mt-0.5 whitespace-pre-line text-sm text-ink">{n.body}</p>
                          {n.editedLabel ? (
                            <p className="mt-1 text-xs text-muted">Edited by {n.editedByName ?? 'staff'} · {n.editedLabel}</p>
                          ) : null}
                        </>
                      )}
                    </div>
                    {editingNoteId === n.id ? null : (
                      <button type="button" onClick={() => setEditingNoteId(n.id)} className="opacity-0 transition-opacity group-hover:opacity-100 text-sm font-bold text-accent-ink hover:underline">Edit</button>
                    )}
                  </li>
                ))}
              </ul>
              {addingNote ? (
                <form action={addInternalNoteAction} onSubmit={() => setAddingNote(false)} className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
                  {hidden}
                  <textarea name="body" required rows={2} autoFocus placeholder="Note for the team (not shown to the client)..." className={field} />
                  <div className="flex gap-2">
                    <button type="submit" className={btnPrimary}>Add note</button>
                    <button type="button" onClick={() => setAddingNote(false)} className={btnGhost}>Cancel</button>
                  </div>
                </form>
              ) : (
                <button type="button" onClick={() => setAddingNote(true)} className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-accent-ink hover:underline">
                  <IconPlus className="h-4 w-4" /> Add note
                </button>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-ink-muted">{label}</dt>
      <dd className={`text-right ${value ? 'text-ink' : 'text-muted'}`}>{value ?? 'Not given'}</dd>
    </div>
  )
}

function SummaryRow({
  href,
  icon,
  title,
  sub,
  danger = false,
}: {
  href: string
  icon: React.ReactNode
  title: string
  sub: string | null
  danger?: boolean
}) {
  return (
    <a href={href} className="flex items-center gap-3 rounded-md border border-line px-3 py-2.5 transition-colors hover:bg-paper">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-sunk text-ink-muted">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm font-bold ${danger ? 'text-danger' : 'text-ink'}`}>{title}</span>
        {sub ? <span className="block truncate text-sm text-muted">{sub}</span> : null}
      </span>
      <IconChevronRight className="h-4 w-4 shrink-0 text-muted" />
    </a>
  )
}
