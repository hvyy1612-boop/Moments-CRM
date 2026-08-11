import type { ReactNode } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Checkbox, Field, Select, Textarea, TextInput } from '@/components/ui/form'
import { EmptyState } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/Spinner'
import { StatusPill } from '@/components/ui/StatusPill'

export const metadata = {
  title: 'Design system — Moments',
  description: 'Component inventory and states for the Moments studio console.',
}

function Section({
  title,
  intro,
  children,
}: {
  title: string
  intro: string
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-serif text-xl font-semibold text-ink">{title}</h2>
        <p className="max-w-prose text-sm text-ink-muted">{intro}</p>
      </div>
      {children}
    </section>
  )
}

function Label({ children }: { children: ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{children}</p>
}

function Money({ children }: { children: string }) {
  return <span className="tabular-nums">{children}</span>
}

export default function StyleguidePage() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="sticky top-0 z-10 border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <span className="font-serif text-lg font-semibold">Moments Studio</span>
            <nav className="hidden gap-5 text-sm text-ink-muted sm:flex">
              <span className="font-medium text-ink">Enquiries</span>
              <span>Quotations</span>
              <span>Bookings</span>
              <span>Invoices</span>
            </nav>
          </div>
          <span className="inline-flex h-8 items-center rounded-full border border-line px-3 text-sm text-ink-muted">
            Shyani
          </span>
        </div>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-14 px-4 py-10">
        <div className="flex flex-col gap-2">
          <h1 className="font-serif text-2xl font-semibold">Design system</h1>
          <p className="max-w-prose text-ink-muted">
            Every component and state used across the studio console, built on the nine colour tokens
            and the type scale from the brief. Hover and focus states are live, so try them with a
            mouse and the keyboard.
          </p>
        </div>

        <Section
          title="Buttons"
          intro="A solid button for the main action on a screen, an outlined one for supporting actions, a red one for actions that remove or cancel, and a plain one for low emphasis."
        >
          <Card>
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <Label>Variants</Label>
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="primary">Send quotation</Button>
                  <Button variant="secondary">Save draft</Button>
                  <Button variant="danger">Cancel booking</Button>
                  <Button variant="ghost">Dismiss</Button>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Sizes</Label>
                <div className="flex flex-wrap items-center gap-3">
                  <Button size="sm">Small</Button>
                  <Button size="md">Medium</Button>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label>States</Label>
                <div className="flex flex-wrap items-center gap-3">
                  <Button>Default</Button>
                  <Button loading>Saving</Button>
                  <Button disabled>Disabled</Button>
                  <Button variant="secondary" loading>
                    Loading
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </Section>

        <Section
          title="Form fields"
          intro="Labels sit above the control. Hints and errors sit below, so the couple or the staff member always knows what to enter and how to fix a mistake."
        >
          <Card title="New enquiry">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Primary name" htmlFor="sg-name" required>
                <TextInput id="sg-name" defaultValue="Aisha Nguyen" />
              </Field>
              <Field
                label="Email"
                htmlFor="sg-email"
                required
                error="Enter a valid email so the studio can reply."
              >
                <TextInput id="sg-email" hasError defaultValue="aisha@" />
              </Field>
              <Field label="Event date" htmlFor="sg-date" hint="You can book up to 18 months ahead.">
                <TextInput id="sg-date" type="date" defaultValue="2027-03-14" />
              </Field>
              <Field label="Enquiry type" htmlFor="sg-type">
                <Select id="sg-type" defaultValue="wedding">
                  <option value="wedding">Wedding</option>
                  <option value="micro">Micro wedding</option>
                  <option value="portrait">Portrait session</option>
                </Select>
              </Field>
              <div className="sm:col-span-2">
                <Field label="Message" htmlFor="sg-msg" hint="Anything the couple told you about their day.">
                  <Textarea id="sg-msg" placeholder="We are getting married at Bendooley Estate and would love both photo and video." />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Venue" htmlFor="sg-venue-disabled" hint="Filled once the couple confirms.">
                  <TextInput id="sg-venue-disabled" disabled placeholder="Not set yet" />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Checkbox
                  id="sg-consent"
                  label="The couple agrees to receive occasional marketing emails from the studio."
                />
              </div>
            </div>
          </Card>
        </Section>

        <Section
          title="Status pills"
          intro="Every status is shown by its label and a colour dot together, so it reads without relying on colour alone."
        >
          <Card>
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <Label>Enquiry</Label>
                <div className="flex flex-wrap gap-2">
                  <StatusPill tone="neutral">New</StatusPill>
                  <StatusPill tone="info">Contacted</StatusPill>
                  <StatusPill tone="info">Quoted</StatusPill>
                  <StatusPill tone="good">Won</StatusPill>
                  <StatusPill tone="neutral">Lost</StatusPill>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Quotation</Label>
                <div className="flex flex-wrap gap-2">
                  <StatusPill tone="neutral">Draft</StatusPill>
                  <StatusPill tone="info">Sent</StatusPill>
                  <StatusPill tone="good">Accepted</StatusPill>
                  <StatusPill tone="neutral">Declined</StatusPill>
                  <StatusPill tone="warn">Expired</StatusPill>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Booking</Label>
                <div className="flex flex-wrap gap-2">
                  <StatusPill tone="warn">Pending fee</StatusPill>
                  <StatusPill tone="good">Confirmed</StatusPill>
                  <StatusPill tone="good">Delivered</StatusPill>
                  <StatusPill tone="neutral">Closed</StatusPill>
                  <StatusPill tone="neutral">Cancelled</StatusPill>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Invoice</Label>
                <div className="flex flex-wrap gap-2">
                  <StatusPill tone="neutral">Issued</StatusPill>
                  <StatusPill tone="warn">Part paid</StatusPill>
                  <StatusPill tone="good">Paid</StatusPill>
                  <StatusPill tone="bad">Overdue</StatusPill>
                  <StatusPill tone="neutral">Void</StatusPill>
                </div>
              </div>
            </div>
          </Card>
        </Section>

        <Section
          title="Messages"
          intro="Inline messages carry one clear point. A left stripe marks how serious it is."
        >
          <div className="flex flex-col gap-3">
            <Alert tone="info" title="The booking fee holds the date">
              The couple keeps their date once the fee clears.
            </Alert>
            <Alert tone="success" title="Quotation sent to the couple">
              You can see it in the outbox.
            </Alert>
            <Alert tone="warning" title="This quotation expires in 2 days">
              Send a reminder or extend the date it is valid until.
            </Alert>
            <Alert tone="danger" title="Two crew members are booked on this date">
              Change the date or reassign one of them before you confirm.
            </Alert>
          </div>
        </Section>

        <Section
          title="Data table"
          intro="The pattern for lists of enquiries, quotations and invoices. Money sits to the right and lines up by digit."
        >
          <Card title="Bookings" actions={<Button size="sm">Add booking</Button>}>
            <div className="overflow-x-auto">
              <table className="w-full whitespace-nowrap text-sm">
                <thead>
                  <tr className="border-b border-line text-left">
                    <th className="px-3 py-2 font-medium text-ink-muted">Couple</th>
                    <th className="px-3 py-2 font-medium text-ink-muted">Event date</th>
                    <th className="px-3 py-2 font-medium text-ink-muted">Package</th>
                    <th className="px-3 py-2 font-medium text-ink-muted">Status</th>
                    <th className="px-3 py-2 text-right font-medium text-ink-muted">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-line transition-colors duration-150 hover:bg-paper">
                    <td className="px-3 py-2.5 text-ink">Aisha and Tom</td>
                    <td className="px-3 py-2.5 text-ink-muted">14 Mar 2027</td>
                    <td className="px-3 py-2.5 text-ink-muted">Wedding photography</td>
                    <td className="px-3 py-2.5">
                      <StatusPill tone="good">Confirmed</StatusPill>
                    </td>
                    <td className="px-3 py-2.5 text-right text-ink">
                      <Money>$3,500.00</Money>
                    </td>
                  </tr>
                  <tr className="border-b border-line transition-colors duration-150 hover:bg-paper">
                    <td className="px-3 py-2.5 text-ink">Priya and Dan</td>
                    <td className="px-3 py-2.5 text-ink-muted">02 May 2027</td>
                    <td className="px-3 py-2.5 text-ink-muted">Photo and video</td>
                    <td className="px-3 py-2.5">
                      <StatusPill tone="info">Quoted</StatusPill>
                    </td>
                    <td className="px-3 py-2.5 text-right text-ink">
                      <Money>$7,850.00</Money>
                    </td>
                  </tr>
                  <tr className="transition-colors duration-150 hover:bg-paper">
                    <td className="px-3 py-2.5 text-ink">Mei and Jack</td>
                    <td className="px-3 py-2.5 text-ink-muted">21 Nov 2026</td>
                    <td className="px-3 py-2.5 text-ink-muted">Micro wedding</td>
                    <td className="px-3 py-2.5">
                      <StatusPill tone="warn">Pending fee</StatusPill>
                    </td>
                    <td className="px-3 py-2.5 text-right text-ink">
                      <Money>$1,500.00</Money>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </Section>

        <Section
          title="Empty states"
          intro="When a list has nothing in it yet, say what belongs there and how to add the first one."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <EmptyState
              title="No enquiries yet"
              description="New enquiries from your website will show up here. You can also add one by hand."
              action={<Button size="sm">Add enquiry</Button>}
            />
            <EmptyState
              title="No quotations"
              description="Create a quotation to send this couple a price for their day."
              action={<Button size="sm">New quotation</Button>}
            />
            <EmptyState
              title="No payments yet"
              description="Record a payment when the couple pays their invoice."
              action={
                <Button size="sm" variant="secondary">
                  Record payment
                </Button>
              }
            />
            <EmptyState
              title="No deliverables"
              description="Deliverables appear here once the booking is confirmed."
            />
          </div>
        </Section>

        <Section
          title="Loading"
          intro="Every list and action shows that it is working, so nobody wonders whether the page has frozen."
        >
          <Card title="Enquiries">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 text-sm text-ink-muted">
                <Spinner className="h-4 w-4" />
                Loading enquiries
              </div>
              <div className="flex flex-col gap-2" aria-hidden="true">
                <div className="h-9 rounded border border-line bg-paper" />
                <div className="h-9 rounded border border-line bg-paper" />
                <div className="h-9 rounded border border-line bg-paper" />
              </div>
            </div>
          </Card>
        </Section>
      </main>
    </div>
  )
}
