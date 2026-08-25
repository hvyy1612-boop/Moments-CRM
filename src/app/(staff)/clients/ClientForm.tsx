import { Button } from '@/components/ui/Button'
import { Checkbox, Field, TextInput, Textarea } from '@/components/ui/form'

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

/** Shared add / edit client form. Posts to the given server action. */
export function ClientForm({
  action,
  csrf,
  values = {},
  clientId,
  submitLabel,
}: {
  action: (formData: FormData) => void | Promise<void>
  csrf: string
  values?: ClientFormValues
  clientId?: string
  submitLabel: string
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

      <div className="mt-4">
        <Field label="Notes" htmlFor="notes">
          <Textarea id="notes" name="notes" defaultValue={v.notes ?? ''} placeholder="Anything worth remembering about this client." />
        </Field>
      </div>

      <div className="mt-6">
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  )
}
