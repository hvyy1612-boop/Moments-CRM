import type { ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { Checkbox, Field, Select, TextInput, Textarea } from '@/components/ui/form'

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

/** Shared client form. With `showEnquiryFields`, it doubles as the single intake: adding the client
 *  also opens an enquiry (event type / date / source / note feed the new lead).
 *
 *  Two layouts from one field set: the default is a bordered card (the full-page /clients/new and the
 *  edit page); `bare` drops the card and splits into a scrollable body + a pinned footer so the same
 *  form drops straight into the "Add client" Modal. Pass `footer` to supply the modal's Cancel + Save. */
export function ClientForm({
  action,
  csrf,
  values = {},
  clientId,
  submitLabel,
  showEnquiryFields = false,
  bare = false,
  footer,
}: {
  action: (formData: FormData) => void | Promise<void>
  csrf: string
  values?: ClientFormValues
  clientId?: string
  submitLabel: string
  showEnquiryFields?: boolean
  bare?: boolean
  footer?: ReactNode
}) {
  const v = values

  const hidden = (
    <>
      <input type="hidden" name="csrf" value={csrf} />
      {clientId ? <input type="hidden" name="clientId" value={clientId} /> : null}
    </>
  )

  const fields = (
    <>
      <div className="mb-5">
        <Checkbox
          name="isCompany"
          id="isCompany"
          defaultChecked={v.isCompany ?? false}
          label="This client is a company (invoices are addressed to the company)."
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="First name" htmlFor="firstName" required>
          <TextInput id="firstName" name="firstName" required defaultValue={v.firstName ?? ''} autoComplete="given-name" />
        </Field>
        <Field label="Last name" htmlFor="lastName">
          <TextInput id="lastName" name="lastName" defaultValue={v.lastName ?? ''} autoComplete="family-name" />
        </Field>
        <Field label="Company" htmlFor="company" hint="Optional. Shown as the client name for a company.">
          <TextInput id="company" name="company" defaultValue={v.company ?? ''} autoComplete="organization" />
        </Field>
        <Field label="Email" htmlFor="email" required>
          <TextInput id="email" name="email" type="email" required defaultValue={v.email ?? ''} autoComplete="email" />
        </Field>
        <Field label="Phone" htmlFor="phone">
          <TextInput id="phone" name="phone" defaultValue={v.phone ?? ''} autoComplete="tel" />
        </Field>
        <Field label="Street" htmlFor="street">
          <TextInput id="street" name="street" defaultValue={v.street ?? ''} autoComplete="address-line1" />
        </Field>
        <Field label="Suburb" htmlFor="suburb">
          <TextInput id="suburb" name="suburb" defaultValue={v.suburb ?? ''} autoComplete="address-level2" />
        </Field>
        <Field label="State" htmlFor="state">
          <TextInput id="state" name="state" defaultValue={v.state ?? ''} autoComplete="address-level1" />
        </Field>
        <Field label="Postcode" htmlFor="postcode">
          <TextInput id="postcode" name="postcode" defaultValue={v.postcode ?? ''} autoComplete="postal-code" />
        </Field>
        <Field label="Country" htmlFor="country">
          <TextInput id="country" name="country" defaultValue={v.country ?? ''} autoComplete="country-name" />
        </Field>
      </div>

      {showEnquiryFields ? (
        <div className="mt-6 border-t border-line pt-6">
          <p className="mb-4 text-xs font-bold uppercase tracking-wide text-muted">Enquiry</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Partner's name" htmlFor="partnerName">
              <TextInput id="partnerName" name="partnerName" placeholder="Their partner (optional)" />
            </Field>
            <Field label="Photography, videography or both?" htmlFor="coverage">
              <Select id="coverage" name="coverage" defaultValue="">
                <option value="">Not sure yet</option>
                <option value="Photography">Photography</option>
                <option value="Videography">Videography</option>
                <option value="Both">Both</option>
              </Select>
            </Field>
            <Field label="Event type" htmlFor="eventType">
              <TextInput id="eventType" name="eventType" placeholder="Wedding" />
            </Field>
            <Field label="Wedding / event date" htmlFor="eventDate">
              <TextInput id="eventDate" name="eventDate" type="date" />
            </Field>
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
          </div>
          {/* Descriptive fields, full width and un-abbreviated, to match the public website enquiry form. */}
          <div className="mt-4 flex flex-col gap-4">
            <Field label="Where is the 'getting-ready' location/s? (if known, or if they'd like it photographed / filmed)" htmlFor="gettingReadyLocation">
              <Textarea id="gettingReadyLocation" name="gettingReadyLocation" placeholder="Enter the getting-ready location/s" />
            </Field>
            <Field label="Where is the ceremony and reception location?" htmlFor="ceremonyLocation">
              <Textarea id="ceremonyLocation" name="ceremonyLocation" placeholder="Enter the ceremony and reception location" />
            </Field>
            <Field label="Tell us more about the wedding day, including how many guests are attending" htmlFor="weddingDetails">
              <Textarea id="weddingDetails" name="weddingDetails" placeholder="Number of guests, the style of the day, and anything else they've shared." />
            </Field>
            <Field label="What draws them to our photography / videography style?" htmlFor="styleReason">
              <Textarea id="styleReason" name="styleReason" placeholder="What appealed to them about our photography / videography (optional)" />
            </Field>
          </div>
        </div>
      ) : null}

      <div className="mt-4">
        <Field label={showEnquiryFields ? 'Note' : 'Notes'} htmlFor="notes">
          <Textarea
            id="notes"
            name="notes"
            defaultValue={v.notes ?? ''}
            placeholder={showEnquiryFields ? 'What are they looking for?' : 'Anything worth remembering about this client.'}
          />
        </Field>
      </div>
    </>
  )

  // Modal layout: no card, a scrollable body and a pinned footer (the Modal card owns the border,
  // rounding and max height). The body scrolls when the intake outgrows the viewport.
  if (bare) {
    return (
      <form action={action} className="flex min-h-0 flex-1 flex-col">
        {hidden}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{fields}</div>
        <div className="border-t border-line px-6 py-4">
          {footer ?? <Button type="submit">{submitLabel}</Button>}
        </div>
      </form>
    )
  }

  // Full-page layout: a bordered card (the /clients/new and edit pages).
  return (
    <form action={action} className="mt-6 rounded-md border border-line bg-surface p-6">
      {hidden}
      {fields}
      <div className="mt-6">
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  )
}
