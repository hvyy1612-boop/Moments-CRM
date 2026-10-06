'use client'

import { useState, type ReactNode } from 'react'
import {
  addInternalNoteAction,
  addRequirementAction,
  addTeamMemberAction,
  deleteInternalNoteAction,
  deleteRequirementAction,
  editInternalNoteAction,
  removeTeamMemberAction,
  updateClientContactAction,
} from '../actions'
import { Modal, ModalField, ModalFooter, modalBody, modalCancelBtn, modalPrimaryBtn } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/ToastProvider'
import { IconButton } from '@/components/ui/IconButton'
import { IconChat, IconChecklist, IconClient, IconExternal, IconMail, IconPhone, IconPlus, IconUsers } from './icons'

export type ReqRow = { id: string; label: string; detail: string; addedLabel: string }
export type NoteRow = { id: string; author: string; body: string; dateLabel: string; editedByName: string | null; editedLabel: string | null }
export type TeamRow = { id: string; name: string; role: string }
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

const field = 'w-full rounded border border-line-strong bg-surface px-3 py-2 text-sm text-ink'
const PENCIL = <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20h4l10-10-4-4L4 16v4z" /><path d="m13.5 6.5 4 4" /></svg>

/** Compact rail card (border hugs the content), matching the Leads rail. */
function Card({ icon, title, action, children }: { icon: ReactNode; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-md border border-line-strong bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted">
          <span className="text-ink-muted">{icon}</span>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/**
 * The job's Client / Notes / Assigned-team cards, moved out of the old Overview tab into the Workflow
 * tab's right rail (next to the workflow, like the Leads page). Compact cards with borders hugging the
 * content; all the interactivity (add requirement / internal note / team member, edit contact, edit note)
 * is unchanged - only the layout is compacted for the narrow rail. Upcoming summary was dropped (the rail
 * already shows "Next action" above these cards).
 */
export function JobSidebar({
  projectId,
  csrf,
  client,
  requirements,
  notes,
  team,
}: {
  projectId: string
  csrf: string
  client: ClientInfo
  requirements: ReqRow[]
  notes: NoteRow[]
  team: TeamRow[]
}) {
  const toast = useToast()
  const [noteView, setNoteView] = useState<'requirements' | 'internal'>('requirements')
  const [addReq, setAddReq] = useState(false)
  const [addMember, setAddMember] = useState(false)
  const [editContact, setEditContact] = useState(false)
  const [addingNote, setAddingNote] = useState(false)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const editingNote = editingNoteId ? notes.find((n) => n.id === editingNoteId) ?? null : null

  const hidden = (
    <>
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="projectId" value={projectId} />
    </>
  )

  return (
    <>
      {/* Client information */}
      <Card
        icon={<IconClient className="h-4 w-4" />}
        title="Client information"
        action={<IconButton label="Edit client" tone="accent" icon={PENCIL} onClick={() => setEditContact(true)} />}
      >
        <dl className="flex flex-col gap-2 text-sm">
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

      {/* Notes: client requirements + internal team notes */}
      <Card
        icon={<IconChecklist className="h-4 w-4" />}
        title="Notes"
        action={
          <IconButton
            label={noteView === 'requirements' ? 'Add requirement' : 'Add note'}
            tone="accent"
            icon={<IconPlus className="h-4 w-4" />}
            onClick={() => (noteView === 'requirements' ? setAddReq(true) : setAddingNote(true))}
          />
        }
      >
        <select
          value={noteView}
          onChange={(e) => setNoteView(e.target.value as 'requirements' | 'internal')}
          aria-label="Choose which notes to view"
          className="mb-3 w-full rounded border border-line-strong bg-surface px-2.5 py-1.5 text-sm font-bold text-ink"
        >
          <option value="requirements">Client requirements</option>
          <option value="internal">Internal notes</option>
        </select>
        {noteView === 'requirements' ? (
          requirements.length === 0 ? (
            <p className="text-sm text-ink-muted">No client requirements yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {requirements.map((r) => (
                <li key={r.id} className="group py-2.5 first:pt-0">
                  <div className="flex items-start justify-between gap-2">
                    <span className="break-words font-bold text-ink">{r.label}</span>
                    <form action={deleteRequirementAction} className="opacity-0 transition-opacity group-hover:opacity-100">
                      {hidden}
                      <input type="hidden" name="requirementId" value={r.id} />
                      <button type="submit" aria-label="Remove requirement" className="shrink-0 text-xs text-muted hover:text-lost-ink">Remove</button>
                    </form>
                  </div>
                  {r.detail ? <p className="mt-0.5 whitespace-pre-line break-words text-sm text-ink-muted">{r.detail}</p> : null}
                  <p className="mt-0.5 text-xs text-muted">{r.addedLabel}</p>
                </li>
              ))}
            </ul>
          )
        ) : notes.length === 0 ? (
          <p className="text-sm text-ink-muted">No internal notes yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {notes.map((n) => (
              <li key={n.id} className="group py-2.5 first:pt-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-bold text-ink">{n.author}</span>
                  <div className="flex shrink-0 items-center gap-3 opacity-0 transition-opacity group-hover:opacity-100">
                    <button type="button" onClick={() => setEditingNoteId(n.id)} className="text-xs text-accent-ink hover:underline">Edit</button>
                    <form action={deleteInternalNoteAction} className="contents">
                      {hidden}
                      <input type="hidden" name="communicationId" value={n.id} />
                      <button type="submit" aria-label="Delete note" className="text-xs text-lost-ink hover:underline">Delete</button>
                    </form>
                  </div>
                </div>
                <p className="mt-0.5 whitespace-pre-line break-words text-sm text-ink">{n.body}</p>
                <p className="mt-0.5 text-xs text-muted">{n.dateLabel}{n.editedLabel ? ` · edited by ${n.editedByName ?? 'staff'} ${n.editedLabel}` : ''}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Assigned team */}
      <Card
        icon={<IconUsers className="h-4 w-4" />}
        title="Assigned team"
        action={<IconButton label="Add member" tone="accent" icon={<IconPlus className="h-4 w-4" />} onClick={() => setAddMember(true)} />}
      >
        {team.length === 0 ? (
          <p className="text-sm text-ink-muted">No team assigned yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {team.map((m) => (
              <li key={m.id} className="group flex items-start justify-between gap-2 py-2.5 first:pt-0">
                <div className="min-w-0">
                  <span className="block break-words font-bold text-ink">{m.name}</span>
                  <span className="block break-words text-sm text-ink-muted">{m.role}</span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <form action={removeTeamMemberAction} className="opacity-0 transition-opacity group-hover:opacity-100">
                    {hidden}
                    <input type="hidden" name="memberId" value={m.id} />
                    <button type="submit" className="text-xs text-muted hover:text-lost-ink">Remove</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ---- Modals (unchanged from the old Overview) ---- */}
      <Modal open={addReq} onClose={() => setAddReq(false)} title="Add requirement" description="Record a confirmed client preference, request or restriction.">
        <form action={async (fd) => { await addRequirementAction(fd); setAddReq(false); toast({ title: 'Requirement added' }) }} className="flex min-h-0 flex-1 flex-col">
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
        <form action={async (fd) => { await addTeamMemberAction(fd); setAddMember(false); toast({ title: 'Team member added' }) }} className="flex min-h-0 flex-1 flex-col">
          <div className={modalBody}>
            {hidden}
            <ModalField label="Name">
              <input name="name" required placeholder="Full name" className={field} />
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
        <form action={async (fd) => { await updateClientContactAction(fd); setEditContact(false); toast({ title: 'Client details updated' }) }} className="flex min-h-0 flex-1 flex-col">
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

      <Modal open={addingNote} onClose={() => setAddingNote(false)} title="Add internal note" description="A note for the team - not shown to the client.">
        <form action={async (fd) => { await addInternalNoteAction(fd); setAddingNote(false); toast({ title: 'Note added' }) }} className="flex min-h-0 flex-1 flex-col">
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
          <form action={async (fd) => { await editInternalNoteAction(fd); setEditingNoteId(null); toast({ title: 'Note updated' }) }} className="flex min-h-0 flex-1 flex-col">
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
    </>
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
