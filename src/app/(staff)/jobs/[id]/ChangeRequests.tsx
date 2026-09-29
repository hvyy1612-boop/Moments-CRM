'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { StatusPill, type Tone } from '@/components/ui/StatusPill'
import { Select, TextInput } from '@/components/ui/form'
import { Button } from '@/components/ui/Button'
import { createChangeRequestAction, changeRequestTransitionAction } from './change-request-actions'

/**
 * Change Request panel (docs/25 Part 3). Lists the job's change requests, shows each one's state, and
 * exposes exactly the state-machine transitions valid for that state (assess -> approve -> apply, or
 * reject; plus recording client agreement as a separate fact). A create form builds the typed payload
 * for the common change types. All figures/labels are computed by the server; this component only
 * renders and posts form actions.
 */

export type ChangeRequestView = {
  id: string
  typeLabel: string
  status: string // PENDING | IMPACT_ASSESSMENT | APPROVED | APPLIED | REJECTED
  statusLabel: string
  summary: string
  requestedBy: string
  createdLabel: string
  needsAgreement: boolean
  clientAgreed: boolean
  impactLabel: string | null
}
type Option = { id: string; label: string }

const STATUS_TONE: Record<string, Tone> = {
  PENDING: 'neutral',
  IMPACT_ASSESSMENT: 'info',
  APPROVED: 'good',
  APPLIED: 'good',
  REJECTED: 'bad',
}

export function ChangeRequests({
  csrf,
  projectId,
  requests,
  bookings,
  invoices,
}: {
  csrf: string
  projectId: string
  requests: ChangeRequestView[]
  bookings: Option[]
  invoices: Option[]
}) {
  const [kind, setKind] = useState('reschedule')
  const [open, setOpen] = useState(false)
  const error = useSearchParams().get('crError')

  const Hidden = () => (
    <>
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="projectId" value={projectId} />
    </>
  )

  return (
    <section id="change-requests" className="rounded-lg border border-line bg-surface p-5">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
          Change requests
          <span className="font-normal text-muted">· {requests.length}</span>
        </h2>
        <Button type="button" variant="secondary" onClick={() => setOpen((v) => !v)}>
          {open ? 'Cancel' : 'New change request'}
        </Button>
      </div>
      <p className="mb-3 text-sm text-ink-muted">Each change is proposed, assessed, approved, and then applied. Records are never edited in place.</p>

      {error ? (
        <div className="mb-3 rounded-md border border-danger bg-paper px-3 py-2 text-sm text-danger">{error}</div>
      ) : null}

      {open ? (
        <form action={createChangeRequestAction} className="mb-4 flex flex-col gap-3 rounded-md border border-line bg-paper p-4">
          <Hidden />
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Type of change</span>
            <Select name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="reschedule">Reschedule the shoot</option>
              <option value="scopeChange">Scope change (new agreed price)</option>
              <option value="priceDecrease">Price decrease (credit note)</option>
              <option value="production">Production revision</option>
            </Select>
          </label>

          {kind === 'reschedule' ? (
            <>
              <label className="flex flex-col gap-1 text-sm"><span className="font-medium text-ink">Which shoot</span>
                <Select name="bookingId">{bookings.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</Select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-sm"><span className="font-medium text-ink">New start</span><TextInput type="datetime-local" name="newStartsAt" /></label>
                <label className="flex flex-col gap-1 text-sm"><span className="font-medium text-ink">New end</span><TextInput type="datetime-local" name="newEndsAt" /></label>
              </div>
              <label className="flex flex-col gap-1 text-sm"><span className="font-medium text-ink">Rescheduling fee (optional)</span><TextInput name="feeAmount" inputMode="decimal" placeholder="e.g. 300" /></label>
            </>
          ) : null}

          {kind === 'scopeChange' ? (
            <>
              <label className="flex flex-col gap-1 text-sm"><span className="font-medium text-ink">What changes</span><TextInput name="summary" placeholder="e.g. Add a second photographer" /></label>
              <label className="flex flex-col gap-1 text-sm"><span className="font-medium text-ink">Added price (fee)</span><TextInput name="feeAmount" inputMode="decimal" placeholder="e.g. 800" /></label>
            </>
          ) : null}

          {kind === 'priceDecrease' ? (
            <>
              <label className="flex flex-col gap-1 text-sm"><span className="font-medium text-ink">Invoice to credit</span>
                <Select name="invoiceId">{invoices.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}</Select>
              </label>
              <label className="flex flex-col gap-1 text-sm"><span className="font-medium text-ink">Credit amount</span><TextInput name="amount" inputMode="decimal" placeholder="e.g. 200" /></label>
              <label className="flex flex-col gap-1 text-sm"><span className="font-medium text-ink">Reason</span><TextInput name="reason" placeholder="e.g. Scope reduced" /></label>
            </>
          ) : null}

          {kind === 'production' ? (
            <>
              <label className="flex flex-col gap-1 text-sm"><span className="font-medium text-ink">Revision requested</span><TextInput name="summary" placeholder="e.g. Re-edit the highlight reel" /></label>
              <label className="flex flex-col gap-1 text-sm"><span className="font-medium text-ink">Due date (optional)</span><TextInput type="date" name="dueAt" /></label>
            </>
          ) : null}

          <div><Button type="submit">Create change request</Button></div>
        </form>
      ) : null}

      {requests.length === 0 ? (
        <p className="rounded-md border border-dashed border-line bg-paper px-4 py-6 text-center text-sm text-ink-muted">No change requests yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {requests.map((cr) => (
            <li key={cr.id} className="rounded-md border border-line p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-ink">{cr.summary}</div>
                  <div className="mt-0.5 text-xs text-muted">{cr.typeLabel} · {cr.requestedBy} · {cr.createdLabel}{cr.impactLabel ? ` · ${cr.impactLabel}` : ''}</div>
                </div>
                <StatusPill tone={STATUS_TONE[cr.status] ?? 'neutral'}>{cr.statusLabel}</StatusPill>
              </div>

              {cr.needsAgreement && !cr.clientAgreed && cr.status !== 'REJECTED' && cr.status !== 'APPLIED' ? (
                <div className="mt-2 text-xs text-warn">Needs the client’s agreement before it can be applied.</div>
              ) : null}
              {cr.clientAgreed ? <div className="mt-2 text-xs text-ok">Client agreement recorded.</div> : null}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {cr.status === 'PENDING' ? (
                  <Transition csrf={csrf} projectId={projectId} id={cr.id} op="assess" label="Assess impact" primary />
                ) : null}
                {cr.status === 'IMPACT_ASSESSMENT' ? (
                  <Transition csrf={csrf} projectId={projectId} id={cr.id} op="approve" label="Approve" primary />
                ) : null}
                {cr.status === 'APPROVED' ? (
                  <Transition csrf={csrf} projectId={projectId} id={cr.id} op="apply" label="Apply change" primary />
                ) : null}
                {(cr.status === 'IMPACT_ASSESSMENT' || cr.status === 'APPROVED') && cr.needsAgreement && !cr.clientAgreed ? (
                  <Transition csrf={csrf} projectId={projectId} id={cr.id} op="agree" label="Record client agreement" />
                ) : null}
                {cr.status !== 'APPLIED' && cr.status !== 'REJECTED' ? (
                  <Transition csrf={csrf} projectId={projectId} id={cr.id} op="reject" label="Reject" quiet />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Transition({
  csrf, projectId, id, op, label, primary, quiet,
}: { csrf: string; projectId: string; id: string; op: string; label: string; primary?: boolean; quiet?: boolean }) {
  return (
    <form action={changeRequestTransitionAction}>
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="changeRequestId" value={id} />
      <input type="hidden" name="op" value={op} />
      <Button type="submit" variant={primary ? 'primary' : quiet ? 'ghost' : 'secondary'}>{label}</Button>
    </form>
  )
}
