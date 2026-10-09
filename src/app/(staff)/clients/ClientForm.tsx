import type { FormEventHandler, ReactNode } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Checkbox, Field, FormActions, FormBlock, FormCell, PageForm, TextInput, Textarea } from '@/components/ui/form'

export type ClientFormValues = {
  firstName?: string | null
  lastName?: string | null
  company?: string | null
  email?: string | null
  phone?: string | null
  street?: string | null
  suburb?: string | null
  state?: string | null
  postcode?: string | null
  country?: string | null
  notes?: string | null
  isCompany?: boolean
}

/** The four contact fields the modal enforces; each holds an inline message when that field is invalid. */
export type ContactErrors = { firstName?: string; lastName?: string; email?: string; phone?: string }

/** Shared client form: the client's contact details only. A lead is added separately, from the client's
 *  page ("Add lead"), Studio-Ninja style - saving a client never opens a lead.
 *
 *  Two layouts from one field set: the default is the full-page Carbon grid form (/clients/new and the
 *  edit page - group headings left, content-sized fields right); `bare` is the compact box layout with
 *  a scrollable body + a pinned footer so the same form drops straight into the "Add client" Modal. In the modal, `requireContact` marks First/Last/
 *  Email/Phone as required and `errors` renders the inline validation the caller ran on submit. */
export function ClientForm({
  action,
  csrf,
  values = {},
  clientId,
  submitLabel,
  bare = false,
  footer,
  errors,
  requireContact = false,
  onSubmit,
  formError,
}: {
  action: (formData: FormData) => void | Promise<void>
  csrf: string
  values?: ClientFormValues
  clientId?: string
  submitLabel: string
  bare?: boolean
  footer?: ReactNode
  errors?: ContactErrors
  requireContact?: boolean
  onSubmit?: FormEventHandler<HTMLFormElement>
  /** A save the server refused (duplicate email, too-long field...): shown above the fields. */
  formError?: string
}) {
  const v = values
  const e = errors ?? {}

  const hidden = (
    <>
      <input type="hidden" name="csrf" value={csrf} />
      {clientId ? <input type="hidden" name="clientId" value={clientId} /> : null}
    </>
  )

  // Each field is built once and placed by the two layouts below (modal box vs. full page grid).
  const isCompanyBox = (
    <Checkbox
      name="isCompany"
      id="isCompany"
      defaultChecked={v.isCompany ?? false}
      label="This client is a company (invoices are addressed to the company)."
    />
  )
  const firstName = (
    <Field label="First name" htmlFor="firstName" required error={e.firstName}>
      <TextInput id="firstName" name="firstName" required hasError={!!e.firstName} defaultValue={v.firstName ?? ''} autoComplete="given-name" />
    </Field>
  )
  const lastName = (
    <Field label="Last name" htmlFor="lastName" required={requireContact} error={e.lastName}>
      <TextInput id="lastName" name="lastName" hasError={!!e.lastName} defaultValue={v.lastName ?? ''} autoComplete="family-name" />
    </Field>
  )
  const company = (
    <Field label="Company" htmlFor="company" hint="Optional. Shown as the client name for a company.">
      <TextInput id="company" name="company" defaultValue={v.company ?? ''} autoComplete="organization" />
    </Field>
  )
  const email = (
    <Field label="Email" htmlFor="email" required error={e.email}>
      <TextInput id="email" name="email" type="email" required hasError={!!e.email} defaultValue={v.email ?? ''} autoComplete="email" />
    </Field>
  )
  const phone = (
    <Field label="Phone" htmlFor="phone" required={requireContact} error={e.phone}>
      <TextInput id="phone" name="phone" hasError={!!e.phone} defaultValue={v.phone ?? ''} autoComplete="tel" />
    </Field>
  )
  const street = (
    <Field label="Street" htmlFor="street">
      <TextInput id="street" name="street" defaultValue={v.street ?? ''} autoComplete="address-line1" />
    </Field>
  )
  const suburb = (
    <Field label="Suburb" htmlFor="suburb">
      <TextInput id="suburb" name="suburb" defaultValue={v.suburb ?? ''} autoComplete="address-level2" />
    </Field>
  )
  const state = (
    <Field label="State" htmlFor="state">
      <TextInput id="state" name="state" defaultValue={v.state ?? ''} autoComplete="address-level1" />
    </Field>
  )
  const postcode = (
    <Field label="Postcode" htmlFor="postcode">
      <TextInput id="postcode" name="postcode" defaultValue={v.postcode ?? ''} autoComplete="postal-code" />
    </Field>
  )
  const country = (
    <Field label="Country" htmlFor="country">
      <TextInput id="country" name="country" defaultValue={v.country ?? ''} autoComplete="country-name" />
    </Field>
  )
  const notesLabel = 'Notes'
  const notesTextarea = (
    <Textarea
      id="notes"
      name="notes"
      defaultValue={v.notes ?? ''}
      placeholder="Anything worth remembering about this client."
    />
  )
  const notes = (
    <Field label={notesLabel} htmlFor="notes">
      {notesTextarea}
    </Field>
  )

  // Modal layout: no card, a scrollable body and a pinned footer (the Modal card owns the border,
  // rounding and max height). `noValidate` lets our inline validation replace native browser tooltips.
  // Dialogs keep Carbon's box model: a compact two-column field grid.
  if (bare) {
    return (
      <form action={action} onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
        {hidden}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {formError ? <div className="mb-5"><Alert tone="danger" title={formError} /></div> : null}
          <div className="mb-5">{isCompanyBox}</div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {firstName}
            {lastName}
            {company}
            {email}
            {phone}
            {street}
            {suburb}
            {state}
            {postcode}
            {country}
          </div>
          <div className="mt-4">{notes}</div>
        </div>
        <div className="border-t border-line px-6 py-4">
          {footer ?? <Button type="submit">{submitLabel}</Button>}
        </div>
      </form>
    )
  }

  // Full-page layout (/clients/new, edit): Carbon dedicated-page form on the grid - group headings on the
  // left, fields on the right sized to their content, so the form fills the page without stretched inputs.
  return (
    <form action={action} className="mt-8">
      {hidden}
      {formError ? <div className="mb-6"><Alert tone="danger" title={formError} /></div> : null}
      <PageForm>
        <FormBlock title="Contact details" description="Who this client is and how to reach them.">
          <FormCell>{isCompanyBox}</FormCell>
          <FormCell span={6}>{firstName}</FormCell>
          <FormCell span={6}>{lastName}</FormCell>
          <FormCell span={7}>{email}</FormCell>
          <FormCell span={5}>{phone}</FormCell>
          <FormCell span={7}>{company}</FormCell>
        </FormBlock>

        <FormBlock title="Address" description="Printed on quotes and invoices. Optional.">
          <FormCell span={8}>{street}</FormCell>
          <FormCell span={4}>{suburb}</FormCell>
          <FormCell span={3}>{state}</FormCell>
          <FormCell span={3}>{postcode}</FormCell>
          <FormCell span={6}>{country}</FormCell>
        </FormBlock>

        {/* The group heading already names this field, so its label is for screen readers only. */}
        <FormBlock
          title={notesLabel}
          description="Anything worth remembering about this client."
        >
          <FormCell>
            <label htmlFor="notes" className="sr-only">{notesLabel}</label>
            {notesTextarea}
          </FormCell>
        </FormBlock>

        <FormActions>
          <Button type="submit">{submitLabel}</Button>
        </FormActions>
      </PageForm>
    </form>
  )
}
