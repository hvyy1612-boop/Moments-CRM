import { Button } from '@/components/ui/Button'
import { Checkbox, Field, Select, TextInput, Textarea } from '@/components/ui/form'

const SOURCES = [
  { value: 'MANUAL', label: 'Manual' },
  { value: 'REFERRAL', label: 'Referral' },
  { value: 'WEBSITE', label: 'Website' },
  { value: 'INSTAGRAM', label: 'Instagram' },
  { value: 'OTHER', label: 'Other' },
]

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
 *  also opens an enquiry (event type / date / source / note feed the new lead). */
export function ClientForm({
  action,
  csrf,
  values = {},
  clientId,
  submitLabel,
  showEnquiryFields = false,
}: {
  action: (formData: FormData) => void | Promise<void>
  csrf: string
  values?: ClientFormValues
  clientId?: string
  submitLabel: string
  showEnquiryFields?: boolean
}) {
  const v = values
  return (
    <form action={action} className="mt-6 rounded-md border border-line bg-surface p-6">
      <input type="hidden" name="csrf" value={csrf} />
      {clientId ? <input type="hidden" name="clientId" value={clientId} /> : null}

      <div className="mb-5">
        <Checkbox
          name="isCompany"
          id="isCompany"
          defaultChecked={v.isCompany ?? false}
          label="This client is a company (invoices are addressed to the company)."
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="First name" htmlFor="firstName">
          <TextInput id="firstName" name="firstName" defaultValue={v.firstName ?? ''} autoComplete="given-name" />
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
            <Field label="Getting-ready location/s" htmlFor="gettingReadyLocation">
              <TextInput id="gettingReadyLocation" name="gettingReadyLocation" placeholder="If known" />
            </Field>
            <Field label="Ceremony & reception location" htmlFor="ceremonyLocation">
              <TextInput id="ceremonyLocation" name="ceremonyLocation" placeholder="If known" />
            </Field>
            <Field label="Approx. guest count" htmlFor="guestCount">
              <TextInput id="guestCount" name="guestCount" placeholder="e.g. 120" />
            </Field>
            <Field label="How did they hear about us?" htmlFor="heardAbout">
              <Select id="heardAbout" name="heardAbout" defaultValue="">
                <option value="">Choose an option</option>
                <option value="Instagram">Instagram</option>
                <option value="Google">Google</option>
                <option value="Facebook">Facebook</option>
                <option value="Referral">Referral (friend / family)</option>
                <option value="Wedding expo">Wedding expo</option>
                <option value="Returning client">Returning client</option>
                <option value="Other">Other</option>
              </Select>
            </Field>
            <Field label="Source" htmlFor="source">
              <Select id="source" name="source" defaultValue="MANUAL">
                {SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="mt-4">
            <Field label="What draws them to our style?" htmlFor="styleReason">
              <Textarea id="styleReason" name="styleReason" placeholder="Optional — what appealed to them about our photography / videography" />
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

      <div className="mt-6">
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  )
}
