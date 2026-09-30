import type { FormEventHandler, ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { Checkbox, Field, FormActions, FormBlock, FormCell, PageForm, Select, TextInput, Textarea } from '@/components/ui/form'

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

export type ContactErrors = { firstName?: string; lastName?: string; email?: string; phone?: string }

export function ClientForm({
  action,
  csrf,
  values = {},
  clientId,
  submitLabel,
  showEnquiryFields = false,
  bare = false,
  footer,
  errors,
  requireContact = false,
  onSubmit,
}: {
  action: (formData: FormData) => void | Promise<void>
  csrf: string
  values?: ClientFormValues
  clientId?: string
  submitLabel: string
  showEnquiryFields?: boolean
  bare?: boolean
  footer?: ReactNode
  errors?: ContactErrors
  requireContact?: boolean
  onSubmit?: FormEventHandler<HTMLFormElement>
}) {
  const v = values
  const e = errors ?? {}

  const hidden = (
    <>
      <input type="hidden" name="csrf" value={csrf} />
      {clientId ? <input type="hidden" name="clientId" value={clientId} /> : null}
    </>
  )

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
  const partnerName = (
    <Field label="Partner's name" htmlFor="partnerName">
      <TextInput id="partnerName" name="partnerName" placeholder="Their partner (optional)" />
    </Field>
  )
  const coverage = (
    <Field label="Photography, videography or both?" htmlFor="coverage">
      <Select id="coverage" name="coverage" defaultValue="">
        <option value="">Not sure yet</option>
        <option value="Photography">Photography</option>
        <option value="Videography">Videography</option>
        <option value="Both">Both</option>
      </Select>
    </Field>
  )
  const eventType = (
    <Field label="Event type" htmlFor="eventType">
      <TextInput id="eventType" name="eventType" placeholder="Wedding" />
    </Field>
  )
  const eventDate = (
    <Field label="Wedding / event date" htmlFor="eventDate">
      <TextInput id="eventDate" name="eventDate" type="date" />
    </Field>
  )
  const heardAbout = (
    <Field label="How did they hear about us?" htmlFor="heardAbout">
      <Select id="heardAbout" name="heardAbout" defaultValue="">
        <option value="">Choose an option</option>
        <option value="Google">Google</option>
        <option value="Gemini">Gemini</option>
        <option value="ChatGPT">ChatGPT</option>
        <option value="Word of mouth">Word of mouth</option>
        <option value="Instagram">Instagram</option>
        <option value="Facebook">Facebook</option>
        <option value="TikTok">TikTok</option>
        <option value="Pinterest">Pinterest</option>
        <option value="Easy Weddings">Easy Weddings</option>
        <option value="Wedshed">Wedshed</option>
        <option value="One Fine Day">One Fine Day</option>
        <option value="Blog post">Blog post</option>
        <option value="Unknown">Unknown</option>
      </Select>
    </Field>
  )

  const gettingReady = (
    <Field label="Where is the 'getting-ready' location/s? (if known, or if they'd like it photographed / filmed)" htmlFor="gettingReadyLocation">
      <Textarea id="gettingReadyLocation" name="gettingReadyLocation" placeholder="Enter the getting-ready location/s" />
    </Field>
  )
  const ceremony = (
    <Field label="Where is the ceremony and reception location?" htmlFor="ceremonyLocation">
      <Textarea id="ceremonyLocation" name="ceremonyLocation" placeholder="Enter the ceremony and reception location" />
    </Field>
  )
  const weddingDetails = (
    <Field label="Tell us more about the wedding day, including how many guests are attending" htmlFor="weddingDetails">
      <Textarea id="weddingDetails" name="weddingDetails" placeholder="Number of guests, the style of the day, and anything else they've shared." />
    </Field>
  )
  const styleReason = (
    <Field label="What draws them to our photography / videography style?" htmlFor="styleReason">
      <Textarea id="styleReason" name="styleReason" placeholder="What appealed to them about our photography / videography (optional)" />
    </Field>
  )
  const notesLabel = showEnquiryFields ? 'Note' : 'Notes'
  const notesTextarea = (
    <Textarea
      id="notes"
      name="notes"
      defaultValue={v.notes ?? ''}
      placeholder={showEnquiryFields ? 'What are they looking for?' : 'Anything worth remembering about this client.'}
    />
  )
  const notes = (
    <Field label={notesLabel} htmlFor="notes">
      {notesTextarea}
    </Field>
  )

  if (bare) {
    return (
      <form action={action} onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
        {hidden}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
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
          {showEnquiryFields ? (

            <div className="mt-8">
              <p className="mb-4 text-xs font-bold uppercase tracking-wide text-muted">Enquiry</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {partnerName}
                {coverage}
                {eventType}
                {eventDate}
                {heardAbout}
              </div>
              <div className="mt-4 flex flex-col gap-4">
                {gettingReady}
                {ceremony}
                {weddingDetails}
                {styleReason}
              </div>
            </div>
          ) : null}
          <div className="mt-4">{notes}</div>
        </div>
        <div className="border-t border-line px-6 py-4">
          {footer ?? <Button type="submit">{submitLabel}</Button>}
        </div>
      </form>
    )
  }

  return (
    <form action={action} className="mt-8">
      {hidden}
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

        {showEnquiryFields ? (
          <FormBlock title="Enquiry" description="Adding the client also opens a lead with these details.">
            <FormCell span={6}>{partnerName}</FormCell>
            <FormCell span={6}>{coverage}</FormCell>
            <FormCell span={4}>{eventType}</FormCell>
            <FormCell span={4}>{eventDate}</FormCell>
            <FormCell span={4}>{heardAbout}</FormCell>
            <FormCell>{gettingReady}</FormCell>
            <FormCell>{ceremony}</FormCell>
            <FormCell>{weddingDetails}</FormCell>
            <FormCell>{styleReason}</FormCell>
          </FormBlock>
        ) : null}

        {/* The group heading already names this field, so its label is for screen readers only. */}
        <FormBlock
          title={notesLabel}
          description={showEnquiryFields ? 'What they are looking for, in your words.' : 'Anything worth remembering about this client.'}
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
