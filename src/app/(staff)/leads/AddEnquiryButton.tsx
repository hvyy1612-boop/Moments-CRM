'use client'

import { type FormEvent, type ReactNode, useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Modal } from '@/components/ui/Modal'
import { Checkbox, Field, Select, TextInput, Textarea } from '@/components/ui/form'
import { JOB_TYPES, LEAD_SOURCES, LEAD_WORKFLOWS, parseNewLead } from '@/features/enquiries/new-lead'
import { addEnquiryAction, type AddEnquiryState, type AddLeadErrors } from './actions'
import { ClientContactPicker } from './ClientContactPicker'

const INITIAL: AddEnquiryState = { status: 'idle' }

const IconEnquiryPlus = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
    <path d="M12 11v6M9 14h6" />
  </svg>
)

/** A small uppercase caption that opens each part of the form, with an optional control on the right. */
function Part({ title, control, children }: { title: string; control?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted">{title}</h3>
        {control}
      </div>
      {children}
    </section>
  )
}

/**
 * "Add lead": a form in a modal that creates a lead (an `Enquiry` row) only when Save lead passes - Cancel
 * or closing stores nothing, so nothing shows in Leads. Two entry points: on a client's page it is pre-bound
 * to THAT client; on the Leads page staff search for an existing client (new clients are added in Clients
 * first). Fields: lead name, job type (Other asks what the client wants), workflow (Wedding for now),
 * source (the website's "How did you hear about us?" list), the main shoot window + location, and a note.
 */
export function AddEnquiryButton({
  csrf,
  clientId,
  clientName,
  clientEmail,
  trigger = 'button',
}: {
  csrf: string
  clientId?: string
  clientName?: string
  clientEmail?: string
  trigger?: 'button' | 'icon'
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState(addEnquiryAction, INITIAL)
  const typed = state.status === 'error' ? state.values : undefined
  const [jobType, setJobType] = useState('')
  const [unconfirmed, setUnconfirmed] = useState(false)
  const [allDay, setAllDay] = useState(false)
  // Errors found in the browser on submit, and the fields edited since (their server error is stale).
  const [clientErrors, setClientErrors] = useState<AddLeadErrors>({})
  const [edited, setEdited] = useState<Set<string>>(new Set())
  const serverErrors = state.status === 'error' ? (state.errors ?? {}) : {}
  const errors: AddLeadErrors = {
    ...Object.fromEntries(Object.entries(serverErrors).filter(([k]) => !edited.has(k))),
    ...clientErrors,
  }
  const topMessage = state.status === 'error' ? state.message : undefined
  const boundToClient = Boolean(clientId)

  useEffect(() => {
    if (state.status === 'created') router.push(`/leads/${state.enquiryId}?toast=enquiry-added`)
  }, [state, router])

  const openModal = () => {
    setJobType(typed?.jobType ?? '')
    setUnconfirmed(typed?.dateUnconfirmed === 'on')
    setAllDay(typed?.allDay === 'on')
    setClientErrors({})
    setEdited(new Set())
    setOpen(true)
  }
  const close = () => setOpen(false)

  const clearError = (field: string) => {
    setClientErrors((prev) => {
      if (!(field in prev)) return prev
      const next = { ...prev }
      delete next[field as keyof AddLeadErrors]
      return next
    })
    setEdited((prev) => (prev.has(field) ? prev : new Set(prev).add(field)))
  }

  // Same checks the server runs, in the browser first, so a blank required field turns red at once.
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    const fd = new FormData(event.currentTarget)
    const parsed = parseNewLead(fd)
    const found: AddLeadErrors = parsed.ok ? {} : { ...parsed.errors }
    if (!String(fd.get('clientId') ?? '').trim()) found.clientId = 'Please choose a client for this lead.'
    setEdited(new Set())
    setClientErrors(found)
    if (Object.keys(found).length > 0) event.preventDefault()
  }

  const shootDisabled = unconfirmed
  const timeDisabled = unconfirmed || allDay

  return (
    <>
      {trigger === 'icon' ? (
        <IconButton label="Add lead" data-write="hide" tone="accent" icon={<IconEnquiryPlus />} onClick={openModal} />
      ) : (
        <button
          type="button"
          data-write="hide"
          onClick={openModal}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-sunk"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          Add lead
        </button>
      )}

      <Modal
        open={open}
        onClose={close}
        title="Add lead"
        description="The lead shows in Leads once you save it."
        size="md"
        headerBorder={false}
      >
        <form
          action={action}
          onSubmit={onSubmit}
          onInput={(e) => {
            const name = (e.target as HTMLInputElement).name
            if (name) clearError(name)
          }}
          noValidate
          className="flex min-h-0 flex-1 flex-col"
        >
          <input type="hidden" name="csrf" value={csrf} />
          <div className="flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto px-6 py-5">
            {topMessage ? <Alert tone="danger" title={topMessage} /> : null}

            {/* Who the lead is for */}
            {boundToClient ? (
              <div className="flex items-center gap-3 rounded-md border border-line bg-paper px-4 py-3">
                <input type="hidden" name="clientId" value={clientId} />
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-semibold text-surface" aria-hidden="true">
                  {(clientName ?? '?').trim().charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-bold uppercase tracking-wide text-muted">Client</span>
                  <span className="block truncate text-base font-medium text-ink">{clientName ?? 'This client'}</span>
                  {clientEmail ? <span className="block truncate text-sm text-ink-muted">{clientEmail}</span> : null}
                </span>
              </div>
            ) : (
              <ClientContactPicker error={errors.clientId} onPick={() => clearError('clientId')} />
            )}

            <Part title="Lead details">
              <Field label="Lead name" htmlFor="lead-name" error={errors.leadName} required>
                <TextInput
                  id="lead-name"
                  name="leadName"
                  defaultValue={typed?.leadName}
                  placeholder="e.g. Jenny & Matt"
                  maxLength={150}
                  autoComplete="off"
                  hasError={Boolean(errors.leadName)}
                />
              </Field>

              <fieldset className="flex flex-col gap-1.5">
                <legend className="mb-1.5 text-sm font-medium text-ink">
                  Job type<span className="text-danger"> *</span>
                </legend>
                {/* Segmented control: one bar divided into equal segments, the selected one filled. */}
                <div
                  role="radiogroup"
                  className={`flex w-full gap-0.5 rounded-md border p-0.5 ${errors.jobType ? 'border-danger' : 'border-line-strong'} bg-surface`}
                >
                  {JOB_TYPES.map((t) => {
                    const checked = jobType === t.value
                    return (
                      <label
                        key={t.value}
                        title={'detail' in t ? t.detail : undefined}
                        className={`flex min-h-9 flex-1 cursor-pointer items-center justify-center rounded px-2 py-1.5 text-center text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent ${
                          checked ? 'bg-ink text-surface' : 'text-ink hover:bg-sunk'
                        }`}
                      >
                        <input
                          type="radio"
                          name="jobType"
                          value={t.value}
                          checked={checked}
                          onChange={() => setJobType(t.value)}
                          className="sr-only"
                        />
                        {t.label}
                      </label>
                    )
                  })}
                </div>
                {errors.jobType ? <p className="text-sm text-danger">{errors.jobType}</p> : null}
              </fieldset>

              {jobType === 'Other' ? (
                <Field label="What is the client asking for?" htmlFor="lead-jobtype-note" error={errors.jobTypeNote} required>
                  <TextInput
                    id="lead-jobtype-note"
                    name="jobTypeNote"
                    defaultValue={typed?.jobTypeNote}
                    placeholder="e.g. Drone footage of the venue only"
                    maxLength={300}
                    autoComplete="off"
                    hasError={Boolean(errors.jobTypeNote)}
                  />
                </Field>
              ) : null}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Workflow" htmlFor="lead-workflow" error={errors.workflow}>
                  <Select id="lead-workflow" name="workflow" defaultValue={typed?.workflow || LEAD_WORKFLOWS[0]}>
                    {LEAD_WORKFLOWS.map((w) => (
                      <option key={w} value={w}>{w}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="How did they hear about us?" htmlFor="lead-source" error={errors.source}>
                  <Select id="lead-source" name="source" defaultValue={typed?.source ?? ''} hasError={Boolean(errors.source)}>
                    <option value="">Not specified</option>
                    {LEAD_SOURCES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </Select>
                </Field>
              </div>
            </Part>

            <Part
              title="Main shoot"
              control={
                <Checkbox
                  id="lead-date-unconfirmed"
                  name="dateUnconfirmed"
                  label="Date not confirmed yet"
                  checked={unconfirmed}
                  onChange={(e) => {
                    setUnconfirmed(e.target.checked)
                    for (const f of ['startDate', 'endDate', 'startTime', 'endTime']) clearError(f)
                  }}
                />
              }
            >
              <div className={`grid grid-cols-2 gap-4 transition-opacity ${shootDisabled ? 'opacity-50' : ''}`}>
                <Field label="Start date" htmlFor="lead-start-date" error={errors.startDate} required={!shootDisabled}>
                  <TextInput id="lead-start-date" name="startDate" type="date" defaultValue={typed?.startDate} disabled={shootDisabled} hasError={Boolean(errors.startDate)} />
                </Field>
                <Field label="Start time" htmlFor="lead-start-time" error={errors.startTime}>
                  <TextInput id="lead-start-time" name="startTime" type="time" defaultValue={typed?.startTime} disabled={timeDisabled} hasError={Boolean(errors.startTime)} />
                </Field>
                <Field label="End date" htmlFor="lead-end-date" error={errors.endDate} hint="Only for a shoot over more than one day.">
                  <TextInput id="lead-end-date" name="endDate" type="date" defaultValue={typed?.endDate} disabled={shootDisabled} hasError={Boolean(errors.endDate)} />
                </Field>
                <Field label="End time" htmlFor="lead-end-time" error={errors.endTime}>
                  <TextInput id="lead-end-time" name="endTime" type="time" defaultValue={typed?.endTime} disabled={timeDisabled} hasError={Boolean(errors.endTime)} />
                </Field>
              </div>
              <div className={shootDisabled ? 'opacity-50' : undefined}>
                <Checkbox
                  id="lead-all-day"
                  name="allDay"
                  label="All day (no set times)"
                  checked={allDay}
                  disabled={shootDisabled}
                  onChange={(e) => {
                    setAllDay(e.target.checked)
                    clearError('startTime')
                    clearError('endTime')
                  }}
                />
              </div>
              <Field label="Location" htmlFor="lead-location" error={errors.location}>
                <TextInput
                  id="lead-location"
                  name="location"
                  defaultValue={typed?.location}
                  placeholder="Venue or address"
                  maxLength={300}
                  autoComplete="off"
                  hasError={Boolean(errors.location)}
                />
              </Field>
            </Part>

            <Field label="Note" htmlFor="lead-note" error={errors.note}>
              <Textarea id="lead-note" name="note" rows={3} defaultValue={typed?.note} placeholder="What the client is looking for, in your words." maxLength={5000} />
            </Field>
          </div>

          <div className="flex items-center gap-3 border-t border-line px-6 py-4">
            <Button type="submit" size="xl" loading={pending}>Save lead</Button>
            <Button type="button" variant="secondary" size="lg" onClick={close}>Cancel</Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
