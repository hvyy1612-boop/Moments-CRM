'use client'

import { useState } from 'react'
import {
  addRequirementAction,
  addTeamMemberAction,
  deleteRequirementAction,
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
const field = 'w-full rounded border border-line-strong bg-surface px-3 py-2 text-sm text-ink'
const btnGhost = 'rounded px-3 py-1.5 text-sm font-bold text-muted hover:text-ink'
const addBtn = 'inline-flex items-center gap-1 rounded border border-line-strong px-2.5 py-1.5 text-sm font-bold text-ink-muted hover:text-ink'

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
}: {
  projectId: string
  csrf: string
  client: ClientInfo
  requirements: ReqRow[]
  team: TeamRow[]
  resources: ResourceOpt[]
  upcoming: Upcoming
}) {
  const [addReq, setAddReq] = useState(false)
  const [addMember, setAddMember] = useState(false)
  const [editContact, setEditContact] = useState(false)

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
            <table className="w-full table-fixed border-collapse text-sm">
              <colgroup>
                <col className="w-56" />
                <col />
                <col className="w-20" />
              </colgroup>
              <thead>
                <tr className="border-b border-line">
                  <th className="pb-2 pr-4 text-left text-xs font-bold uppercase tracking-wide text-muted">Requirement</th>
                  <th className="pb-2 pr-4 text-left text-xs font-bold uppercase tracking-wide text-muted">Details</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {requirements.map((r) => (
                  <tr key={r.id} className="group border-b border-line align-top last:border-b-0">
                    <td className="py-3 pr-4 font-bold text-ink break-words">{r.label}</td>
                    <td className="py-3 pr-4 whitespace-pre-line break-words text-ink-muted">{r.detail}</td>
                    <td className="py-3 text-right">
                      <form action={deleteRequirementAction} className="opacity-0 transition-opacity group-hover:opacity-100">
                        {hidden}
                        <input type="hidden" name="requirementId" value={r.id} />
                        <button type="submit" aria-label="Remove requirement" className="text-sm text-muted hover:text-lost-ink">Remove</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
            <table className="w-full table-fixed border-collapse text-sm">
              <colgroup>
                <col className="w-56" />
                <col />
                <col className="w-24" />
              </colgroup>
              <thead>
                <tr className="border-b border-line">
                  <th className="pb-2 pr-4 text-left text-xs font-bold uppercase tracking-wide text-muted">Name</th>
                  <th className="pb-2 pr-4 text-left text-xs font-bold uppercase tracking-wide text-muted">Role</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {team.map((m) => (
                  <tr key={m.id} className="group border-b border-line align-top last:border-b-0">
                    <td className="py-3 pr-4 font-bold text-ink break-words">{m.name}</td>
                    <td className="py-3 pr-4 break-words text-ink-muted">{m.role}</td>
                    <td className="py-3">
                      <div className="flex items-center justify-end gap-3">
                        {m.email ? (
                          <a href={`mailto:${m.email}`} aria-label={`Email ${m.name}`} className="text-ink-muted hover:text-ink"><IconMail className="h-4 w-4" /></a>
                        ) : null}
                        <form action={removeTeamMemberAction} className="opacity-0 transition-opacity group-hover:opacity-100">
                          {hidden}
                          <input type="hidden" name="memberId" value={m.id} />
                          <button type="submit" className="text-sm text-muted hover:text-lost-ink">Remove</button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
