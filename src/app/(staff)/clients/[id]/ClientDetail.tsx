'use client'

import type { ReactNode } from 'react'
import { useActionState, useEffect, useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { IconButton } from '@/components/ui/IconButton'
import { useToast } from '@/components/ui/ToastProvider'
import { TextInput, Select, Textarea } from '@/components/ui/form'
import { AddEnquiryButton } from '../../leads/AddEnquiryButton'
import { restoreClientAction } from '../actions'
import { DeleteClientButton } from './DeleteClientButton'
import { saveClientDetailAction, type SaveDetailState } from './actions'

export type ClientDetailData = {
  id: string
  clientNumber: string | null
  displayName: string
  email: string
  phone: string | null
  partnerName: string | null
  preferredContact: string | null
  source: string
  status: string
  addressLine: string
  createdLabel: string
  archived: boolean
}
export type EnquiryDetailData = {
  id: string
  eventDateISO: string
  eventDateLabel: string
  coverage: string | null
  gettingReadyLocation: string | null
  ceremonyLocation: string | null
  weddingDetails: string | null
  styleReason: string | null
  heardAbout: string | null
  message: string | null
}

const INITIAL: SaveDetailState = { status: 'idle' }
const FORM_ID = 'client-detail-form'

const svg = { fill: 'none' as const, stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24' }
const IconPencil = () => (<svg className="h-4 w-4" {...svg}><path d="M4 20h4l10-10-4-4L4 16v4z" /><path d="m13.5 6.5 4 4" /></svg>)
const IconCheck = () => (<svg className="h-4 w-4" {...svg} strokeWidth={2}><path d="M5 12.5l4.5 4.5L19 7" /></svg>)
const IconX = () => (<svg className="h-4 w-4" {...svg}><path d="M6 6l12 12M18 6 6 18" /></svg>)
const IconPerson = () => (<svg className="h-5 w-5" {...svg}><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 4-6 8-6s8 2 8 6" /></svg>)
const IconRestore = () => (<svg className="h-4 w-4" {...svg}><path d="M4 12a8 8 0 1 0 2.4-5.7" /><path d="M4 4v4h4" /></svg>)
const IconDoc = () => (<svg className="h-5 w-5" {...svg}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></svg>)

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p.charAt(0).toUpperCase()).join('') || '?'
}
function label(value: string): string {
  return value ? value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ') : value
}

const SOURCE_OPTIONS = ['ENQUIRY', 'REFERRAL', 'MANUAL', 'OTHER']

const STATUS_OPTIONS = ['PROSPECT', 'ACTIVE']
const CONTACT_OPTIONS = ['Email', 'Phone', 'Text message']

const COVERAGE_OPTIONS = ['Photography', 'Videography', 'Both', 'Other']

function DocSection({ title, icon, action, children }: { title: string; icon: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-9">
      <div className="flex items-center justify-between gap-3 border-b border-line pb-2.5">
        <h2 className="flex items-center gap-2 text-base font-semibold text-accent-ink">
          <span aria-hidden="true">{icon}</span>
          {title}
        </h2>
        {action}
      </div>
      <div className="mt-6 grid grid-cols-1 gap-x-10 gap-y-5 md:grid-cols-2">{children}</div>
    </section>
  )
}

function ViewBox({ value, multiline = false }: { value?: string | null; multiline?: boolean }) {
  const has = value != null && value.trim() !== ''
  return (
    <div className={`min-h-10 w-full break-words rounded border border-line-strong bg-surface px-3 py-2 text-base ${has ? 'text-ink' : 'text-muted'} ${multiline ? 'whitespace-pre-line' : ''}`}>
      {has ? value : '-'}
    </div>
  )
}

function Slot({ label: text, required = false, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink">
        {text}
        {required ? <span className="text-danger"> *</span> : null}
      </span>
      {children}
    </div>
  )
}

function OptionSelect({ name, value, options, includeBlank = false }: { name: string; value: string | null; options: string[]; includeBlank?: boolean }) {
  const all = value && !options.includes(value) ? [value, ...options] : options
  return (
    <Select name={name} defaultValue={value ?? ''}>
      {includeBlank ? <option value="">-</option> : null}
      {all.map((o) => (
        <option key={o} value={o}>{SOURCE_OPTIONS.includes(o) || STATUS_OPTIONS.includes(o) ? label(o) : o}</option>
      ))}
    </Select>
  )
}

export function ClientDetail({
  client,
  enquiry,
  enquiryCount,
  csrf,
  canDelete,
}: {
  client: ClientDetailData
  enquiry: EnquiryDetailData | null
  enquiryCount: number
  csrf: string
  canDelete: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [state, formAction, pending] = useActionState(saveClientDetailAction, INITIAL)
  const toast = useToast()

  useEffect(() => {
    if (state.status === 'saved') {
      setEditing(false)
      setDirty(false)
      toast({ title: 'Client saved' })
    }
  }, [state, toast])

  const typed = state.status === 'error' ? state.values : undefined
  const v = (name: string, saved: string | null | undefined) => typed?.[name] ?? saved ?? ''

  const startEdit = () => { setDirty(false); setEditing(true) }
  const cancelEdit = () => { setDirty(false); setEditing(false) }

  return (
    <>
      {/* Header: identity + icon-only toolbar. */}
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-tint text-base font-semibold text-accent-ink">
            {initials(client.displayName)}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold leading-tight text-ink">{client.displayName}</h1>
            <p className="mt-0.5 truncate text-sm text-ink-muted">
              {client.clientNumber ? <span className="tabular text-ink-muted">{client.clientNumber} · </span> : null}
              <a href={`mailto:${client.email}`} className="hover:text-ink">{client.email}</a>
              {client.phone ? ` · ${client.phone}` : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {client.archived ? (
            <form action={restoreClientAction}>
              <input type="hidden" name="csrf" value={csrf} />
              <input type="hidden" name="clientId" value={client.id} />
              <IconButton type="submit" label="Restore client" tone="accent" icon={<IconRestore />} />
            </form>
          ) : (
            <>
              <AddEnquiryButton csrf={csrf} clientId={client.id} clientName={client.displayName} clientEmail={client.email} trigger="icon" />
              {/* Studio Ninja's client profile offers both: a new enquiry (lead) or a booking already confirmed (job). */}
              <AddEnquiryButton kind="job" csrf={csrf} clientId={client.id} clientName={client.displayName} clientEmail={client.email} trigger="icon" />
            </>
          )}
          {editing ? (
            <>
              {dirty ? <IconButton label="Save changes" tone="accent" icon={<IconCheck />} form={FORM_ID} type="submit" disabled={pending} /> : null}
              <IconButton label="Cancel" icon={<IconX />} onClick={cancelEdit} disabled={pending} />
            </>
          ) : (
            <IconButton label="Edit" tone="accent" icon={<IconPencil />} onClick={startEdit} />
          )}
          {canDelete && !client.archived ? <DeleteClientButton clientId={client.id} name={client.displayName} csrf={csrf} /> : null}
        </div>
      </div>

      {client.archived ? <div className="mt-4"><Alert tone="info" title="This client is archived. Restore them to bring them back to the Active list." /></div> : null}
      {state.status === 'error' ? <div className="mt-4"><Alert tone="danger" title={state.message} /></div> : null}

      <form id={FORM_ID} action={formAction} onChange={() => setDirty(true)}>
        <input type="hidden" name="csrf" value={csrf} />
        <input type="hidden" name="clientId" value={client.id} />
        {enquiry ? <input type="hidden" name="enquiryId" value={enquiry.id} /> : null}
        <input type="hidden" name="addressOriginal" value={client.addressLine} />

        {/* Client details */}
        <DocSection title="Client details" icon={<IconPerson />}>
          <Slot label="Client name" required>
            {editing ? <TextInput name="displayName" defaultValue={v('displayName', client.displayName)} maxLength={150} autoComplete="off" /> : <ViewBox value={client.displayName} />}
          </Slot>
          <Slot label="Partner name">
            {editing ? <TextInput name="partnerName" defaultValue={v('partnerName', client.partnerName)} maxLength={150} autoComplete="off" /> : <ViewBox value={client.partnerName} />}
          </Slot>
          <Slot label="Email" required>
            {editing ? <TextInput name="email" type="email" defaultValue={v('email', client.email)} autoComplete="off" /> : <ViewBox value={client.email} />}
          </Slot>
          <Slot label="Mobile" required>
            {editing ? <TextInput name="phone" defaultValue={v('phone', client.phone)} maxLength={30} autoComplete="off" /> : <ViewBox value={client.phone} />}
          </Slot>
          <Slot label="Wedding / Event date">
            {editing && enquiry ? (
              <TextInput name="eventDate" type="date" defaultValue={v('eventDate', enquiry.eventDateISO)} />
            ) : (
              <ViewBox value={enquiry?.eventDateLabel ?? null} />
            )}
          </Slot>
          <Slot label="Photography or Videography or Both?">
            {editing && enquiry ? (
              <OptionSelect name="coverage" value={v('coverage', enquiry.coverage) || null} options={COVERAGE_OPTIONS} includeBlank />
            ) : (
              <ViewBox value={enquiry?.coverage ?? null} />
            )}
          </Slot>
          <Slot label="Address / Suburb">
            {editing ? <TextInput name="address" defaultValue={v('address', client.addressLine)} maxLength={200} autoComplete="off" /> : <ViewBox value={client.addressLine} />}
          </Slot>
          <Slot label="Preferred contact">
            {editing ? <OptionSelect name="preferredContact" value={v('preferredContact', client.preferredContact) || null} options={CONTACT_OPTIONS} includeBlank /> : <ViewBox value={client.preferredContact} />}
          </Slot>
          <Slot label="Source">
            {editing ? <OptionSelect name="source" value={v('source', client.source)} options={SOURCE_OPTIONS} /> : <ViewBox value={label(client.source)} />}
          </Slot>
          <Slot label="Status">
            {editing && !client.archived ? <OptionSelect name="status" value={v('status', client.status)} options={STATUS_OPTIONS} /> : <ViewBox value={label(client.status)} />}
          </Slot>
          <Slot label="Client since">
            <ViewBox value={client.createdLabel} />
          </Slot>
        </DocSection>

        {/* Enquiry details - the website Contact-Us answers. */}
        <DocSection
          title="Enquiry details"
          icon={<IconDoc />}
          action={
            enquiry ? (
              <a href={`/leads/${enquiry.id}`} className="text-sm font-medium text-accent-ink hover:underline">
                {enquiryCount > 1 ? `Open lead (${enquiryCount})` : 'Open lead'}
              </a>
            ) : null
          }
        >
          {enquiry ? (
            <>
              <Slot label="Where is your 'getting-ready' location?" required>
                {editing ? <Textarea name="gettingReadyLocation" rows={3} defaultValue={v('gettingReadyLocation', enquiry.gettingReadyLocation)} /> : <ViewBox value={enquiry.gettingReadyLocation} multiline />}
              </Slot>
              <Slot label="Where is your ceremony and reception location?" required>
                {editing ? <Textarea name="ceremonyLocation" rows={3} defaultValue={v('ceremonyLocation', enquiry.ceremonyLocation)} /> : <ViewBox value={enquiry.ceremonyLocation} multiline />}
              </Slot>
              <Slot label="Wedding day details / guest numbers" required>
                {editing ? <Textarea name="weddingDetails" rows={3} defaultValue={v('weddingDetails', enquiry.weddingDetails)} /> : <ViewBox value={enquiry.weddingDetails} multiline />}
              </Slot>
              <Slot label="What draws you to our photography / videography style?" required>
                {editing ? <Textarea name="styleReason" rows={3} defaultValue={v('styleReason', enquiry.styleReason)} /> : <ViewBox value={enquiry.styleReason} multiline />}
              </Slot>
              <Slot label="How did you hear about us?">
                {editing ? <Textarea name="heardAbout" rows={3} maxLength={5000} defaultValue={v('heardAbout', enquiry.heardAbout)} /> : <ViewBox value={enquiry.heardAbout} multiline />}
              </Slot>
              <Slot label="Additional notes">
                {editing ? <Textarea name="additionalNotes" rows={3} defaultValue={v('additionalNotes', enquiry.message)} /> : <ViewBox value={enquiry.message} multiline />}
              </Slot>
            </>
          ) : (
            <p className="text-base text-ink-muted md:col-span-2">No lead on file yet. Use the Add lead action above to record one for this client.</p>
          )}
        </DocSection>
      </form>
    </>
  )
}
