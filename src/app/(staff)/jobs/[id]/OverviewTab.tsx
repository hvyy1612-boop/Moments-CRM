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
import { Modal, ModalField, ModalFooter, modalBody, modalCancelBtn, modalPrimaryBtn } from '@/components/ui/Modal'
import {
  IconCalendar,
  IconChat,
  IconChecklist,
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

const field = 'w-full rounded border border-line-strong bg-surface px-3 py-2 text-sm text-ink'
const btnGhost = 'rounded px-3 py-1.5 text-sm font-bold text-muted hover:text-ink'
const addBtn = 'inline-flex items-center gap-1 rounded border border-line-strong px-2.5 py-1.5 text-sm font-bold text-ink-muted hover:text-ink'

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
}) {
  const [addReq, setAddReq] = useState(false)
  const [addMember, setAddMember] = useState(false)
  const [editContact, setEditContact] = useState(false)
  const [activityTab, setActivityTab] = useState<'messages' | 'notes'>('messages')
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [addingMessage, setAddingMessage] = useState(false)
  const [addingNote, setAddingNote] = useState(false)
  const editingNote = editingNoteId ? notes.find((n) => n.id === editingNoteId) ?? null : null

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
            <button type="button" onClick={() => setAddReq(true)} className={addBtn}>
              <IconPlus className="h-4 w-4" /> Add requirement
            </button>
          }
        >
          {requirements.length === 0 ? (
            <p className="text-sm text-ink-muted">No requirements recorded yet.</p>
          ) : (
            <div>
              <div className="hidden border-b border-line pb-2 pr-16 sm:flex sm:gap-6">
                <span className="w-48 shrink-0 text-xs font-bold uppercase tracking-wide text-muted">Requirement</span>
                <span className="flex-1 text-xs font-bold uppercase tracking-wide text-muted">Details</span>
              </div>
              <dl className="flex flex-col divide-y divide-line">
                {requirements.map((r) => (
                  <div key={r.id} className="group relative py-3">
                    <div className="flex min-w-0 flex-col gap-1 pr-16 sm:flex-row sm:gap-6">
                      <dt className="text-sm font-bold text-ink sm:w-48 sm:shrink-0">{r.label}</dt>
                      <dd className="min-w-0 flex-1 whitespace-pre-line text-sm text-ink-muted">{r.detail}</dd>
                    </div>
                    <form action={deleteRequirementAction} className="absolute right-0 top-3 opacity-0 transition-opacity group-hover:opacity-100">
                      {hidden}
                      <input type="hidden" name="requirementId" value={r.id} />
                      <button type="submit" aria-label="Remove requirement" className="text-sm text-muted hover:text-lost-ink">Remove</button>
                    </form>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </Card>

        {/* Client information */}
        <Card
          className="lg:col-span-2"
          icon={<IconClient className="h-5 w-5" />}
          title="Client information"
          subtitle="Contact details and key information."
          action={<button type="button" onClick={() => setEditContact(true)} className={btnGhost}>Edit</button>}
        >
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
          </dl>
        </Card>

        {/* Assigned team (no avatars) */}
        <Card
          className="lg:col-span-3"
          icon={<IconUsers className="h-5 w-5" />}
          title="Assigned team"
          subtitle="People responsible for this job."
          action={
            <button type="button" onClick={() => setAddMember(true)} className={addBtn}>
              <IconPlus className="h-4 w-4" /> Add member
            </button>
          }
        >
          {team.length === 0 ? (
            <p className="text-sm text-ink-muted">No team assigned yet.</p>
          ) : (
            <div>
              <div className="hidden border-b border-line pb-2 pr-20 sm:flex sm:gap-6">
                <span className="w-48 shrink-0 text-xs font-bold uppercase tracking-wide text-muted">Name</span>
                <span className="flex-1 text-xs font-bold uppercase tracking-wide text-muted">Role</span>
              </div>
              <ul className="flex flex-col divide-y divide-line">
                {team.map((m) => (
                  <li key={m.id} className="group relative py-3">
                    <div className="flex min-w-0 flex-col gap-1 pr-20 sm:flex-row sm:gap-6">
                      <span className="text-sm font-bold text-ink sm:w-48 sm:shrink-0">{m.name}</span>
                      <span className="min-w-0 flex-1 text-sm text-ink-muted">{m.role}</span>
                    </div>
                    <div className="absolute right-0 top-3 flex items-center gap-3">
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
            </div>
          )}
        </Card>

        {/* Upcoming summary: at-a-glance info (read-only). */}
        <Card
          className="lg:col-span-2"
          icon={<IconCalendar className="h-5 w-5" />}
          title="Upcoming summary"
          subtitle="Next key actions, shoot details and payment."
        >
          <div className="flex flex-col gap-2">
            <SummaryRow
              icon={<IconChecklist className="h-4 w-4" />}
              title={upcoming.nextAction ? (upcoming.nextAction.kind === 'task' ? upcoming.nextAction.title : `Waiting on ${upcoming.nextAction.label}`) : 'All caught up'}
              sub={upcoming.nextAction && upcoming.nextAction.kind === 'task'
                ? [upcoming.nextAction.owner, upcoming.nextAction.dueLabel ? `Due ${upcoming.nextAction.dueLabel}` : null].filter(Boolean).join(' · ') || null
                : upcoming.nextAction && upcoming.nextAction.kind === 'waiting' ? 'Updates automatically' : null}
              danger={Boolean(upcoming.nextAction && upcoming.nextAction.kind === 'task' && upcoming.nextAction.needsAttention)}
            />
            <SummaryRow
              icon={<IconCalendar className="h-4 w-4" />}
              title={upcoming.shootLabel ?? 'Not scheduled'}
              sub={upcoming.shootLocation}
            />
            <SummaryRow
              icon={<IconReceipt className="h-4 w-4" />}
              title={upcoming.paymentLabel}
              sub={upcoming.paymentSub}
            />
            <SummaryRow
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
              <button type="button" onClick={() => setAddingMessage(true)} className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-accent-ink hover:underline">
                <IconPlus className="h-4 w-4" /> Add message
              </button>
            </>
          ) : (
            <>
              <ul className="flex flex-col divide-y divide-line">
                {notes.length === 0 ? <li className="py-2 text-sm text-ink-muted">No internal notes yet.</li> : null}
                {notes.map((n) => (
                  <li key={n.id} className="group flex items-start gap-3 py-3 first:pt-0">
                    <Avatar name={n.author} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-sm font-bold text-ink">{n.author}</span>
                        <span className="text-xs text-muted">{n.dateLabel}</span>
                      </div>
                      <p className="mt-0.5 whitespace-pre-line text-sm text-ink">{n.body}</p>
                      {n.editedLabel ? (
                        <p className="mt-1 text-xs text-muted">Edited by {n.editedByName ?? 'staff'} · {n.editedLabel}</p>
                      ) : null}
                    </div>
                    <button type="button" onClick={() => setEditingNoteId(n.id)} className="opacity-0 transition-opacity group-hover:opacity-100 text-sm font-bold text-accent-ink hover:underline">Edit</button>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => setAddingNote(true)} className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-accent-ink hover:underline">
                <IconPlus className="h-4 w-4" /> Add note
              </button>
            </>
          )}
        </div>
      </section>

      {/* ---- Modals (Carbon transactional dialogs) ---- */}
      <Modal open={addReq} onClose={() => setAddReq(false)} title="Add requirement" description="Record a confirmed client preference, request or restriction.">
        <form action={async (fd) => { await addRequirementAction(fd); setAddReq(false) }} className="flex min-h-0 flex-1 flex-col">
          <div className={modalBody}>
            {hidden}
            <ModalField label="Requirement"><input name="label" required placeholder="e.g. Photography style" className={field} /></ModalField>
            <ModalField label="Details"><textarea name="detail" required rows={4} placeholder="Describe the requirement..." className={field} /></ModalField>
          </div>
          <ModalFooter>
            <button type="button" onClick={() => setAddReq(false)} className={modalCancelBtn}>Cancel</button>
            <button type="submit" className={modalPrimaryBtn}>Add requirement</button>
          </ModalFooter>
        </form>
      </Modal>

      <Modal open={addMember} onClose={() => setAddMember(false)} title="Add team member" description="Assign a person responsible for this job.">
        <form action={async (fd) => { await addTeamMemberAction(fd); setAddMember(false) }} className="flex min-h-0 flex-1 flex-col">
          <div className={modalBody}>
            {hidden}
            {resources.length > 0 ? (
              <ModalField label="Person">
                <select name="resourceId" defaultValue="" className={field}>
                  <option value="">Select a person...</option>
                  {resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </ModalField>
            ) : null}
            <ModalField label={resources.length > 0 ? 'Or type a name (if not listed)' : 'Name'}>
              <input name="name" placeholder="Full name" className={field} />
            </ModalField>
            <ModalField label="Role"><input name="role" required placeholder="e.g. Lead Photographer" className={field} /></ModalField>
          </div>
          <ModalFooter>
            <button type="button" onClick={() => setAddMember(false)} className={modalCancelBtn}>Cancel</button>
            <button type="submit" className={modalPrimaryBtn}>Add member</button>
          </ModalFooter>
        </form>
      </Modal>

      <Modal open={editContact} onClose={() => setEditContact(false)} title="Edit client information" label={client.displayName}>
        <form action={async (fd) => { await updateClientContactAction(fd); setEditContact(false) }} className="flex min-h-0 flex-1 flex-col">
          <div className={modalBody}>
            {hidden}
            <input type="hidden" name="clientId" value={client.clientId} />
            <ModalField label="Partner"><input name="partnerName" defaultValue={client.partnerName ?? ''} placeholder="Partner name" className={field} /></ModalField>
            <ModalField label="Phone"><input name="phone" defaultValue={client.phone ?? ''} placeholder="Phone number" className={field} /></ModalField>
            <ModalField label="Preferred contact"><input name="preferredContact" defaultValue={client.preferredContact ?? ''} placeholder="e.g. Email (SMS on shoot day)" className={field} /></ModalField>
            <ModalField label="Instagram"><input name="instagram" defaultValue={client.instagram ?? ''} placeholder="handle" className={field} /></ModalField>
          </div>
          <ModalFooter>
            <button type="button" onClick={() => setEditContact(false)} className={modalCancelBtn}>Cancel</button>
            <button type="submit" className={modalPrimaryBtn}>Save changes</button>
          </ModalFooter>
        </form>
      </Modal>

      <Modal open={addingMessage} onClose={() => setAddingMessage(false)} title="Record a client message" description="Log a message the client sent you.">
        <form action={async (fd) => { await logProjectClientReplyAction(fd); setAddingMessage(false) }} className="flex min-h-0 flex-1 flex-col">
          <div className={modalBody}>
            {hidden}
            <ModalField label="Message"><textarea name="body" required rows={5} placeholder="Paste what the client said..." className={field} /></ModalField>
          </div>
          <ModalFooter>
            <button type="button" onClick={() => setAddingMessage(false)} className={modalCancelBtn}>Cancel</button>
            <button type="submit" className={modalPrimaryBtn}>Add message</button>
          </ModalFooter>
        </form>
      </Modal>

      <Modal open={addingNote} onClose={() => setAddingNote(false)} title="Add internal note" description="A note for the team - not shown to the client.">
        <form action={async (fd) => { await addInternalNoteAction(fd); setAddingNote(false) }} className="flex min-h-0 flex-1 flex-col">
          <div className={modalBody}>
            {hidden}
            <ModalField label="Note"><textarea name="body" required rows={5} placeholder="Note for the team..." className={field} /></ModalField>
          </div>
          <ModalFooter>
            <button type="button" onClick={() => setAddingNote(false)} className={modalCancelBtn}>Cancel</button>
            <button type="submit" className={modalPrimaryBtn}>Add note</button>
          </ModalFooter>
        </form>
      </Modal>

      <Modal open={Boolean(editingNote)} onClose={() => setEditingNoteId(null)} title="Edit note">
        {editingNote ? (
          <form action={async (fd) => { await editInternalNoteAction(fd); setEditingNoteId(null) }} className="flex min-h-0 flex-1 flex-col">
            <div className={modalBody}>
              {hidden}
              <input type="hidden" name="communicationId" value={editingNote.id} />
              <ModalField label="Note"><textarea name="body" required rows={5} defaultValue={editingNote.body} className={field} /></ModalField>
            </div>
            <ModalFooter>
              <button type="button" onClick={() => setEditingNoteId(null)} className={modalCancelBtn}>Cancel</button>
              <button type="submit" className={modalPrimaryBtn}>Save</button>
            </ModalFooter>
          </form>
        ) : null}
      </Modal>
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
  icon,
  title,
  sub,
  danger = false,
}: {
  icon: React.ReactNode
  title: string
  sub: string | null
  danger?: boolean
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-line px-3 py-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-sunk text-ink-muted">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm font-bold ${danger ? 'text-danger' : 'text-ink'}`}>{title}</span>
        {sub ? <span className="block truncate text-sm text-muted">{sub}</span> : null}
      </span>
    </div>
  )
}
