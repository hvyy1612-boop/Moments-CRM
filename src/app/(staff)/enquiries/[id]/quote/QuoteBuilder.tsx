'use client'

import { useActionState, useMemo, useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/form'
import { createQuoteAction, type QuoteFormState } from './actions'

const INITIAL: QuoteFormState = { status: 'idle' }

type PackageOption = {
  code: string
  name: string
  price: string
  includedHours: number
  includedTravelKm: number
  unpriced: boolean
}
type AddOnOption = {
  code: string
  name: string
  price: string
  priceAfter: string | null
  requiresAny: string[]
  unpriced: boolean
}
type RuleOption = {
  code: string
  name: string
  requiresAll: string[]
  excludes: string[]
  target: string | null
  type: 'PERCENTAGE' | 'FIXED'
  value: string
  order: number
}

function toCents(value: string): bigint {
  const [whole = '0', fraction = '0'] = value.split('.')
  const padded = (fraction + '00').slice(0, 2)
  return BigInt(whole) * 100n + BigInt(padded)
}

function fromCents(cents: bigint): string {
  const negative = cents < 0n
  const absolute = negative ? -cents : cents
  const whole = (absolute / 100n).toString()
  const remainder = (absolute % 100n).toString().padStart(2, '0')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${negative ? '-' : ''}$${grouped}.${remainder}`
}

function divideHalfUp(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n
  const absolute = negative ? -numerator : numerator
  const quotient = absolute / denominator
  const twiceRemainder = (absolute % denominator) * 2n
  const rounded = twiceRemainder >= denominator ? quotient + 1n : quotient
  return negative ? -rounded : rounded
}

export function QuoteBuilder({
  enquiryId,
  packages,
  addOns,
  rules,
  preselected,
  csrf,
}: {
  enquiryId: string
  packages: PackageOption[]
  addOns: AddOnOption[]
  rules: RuleOption[]
  preselected: string[]
  csrf: string
}) {
  const [state, action, pending] = useActionState(createQuoteAction, INITIAL)
  const [chosenPackages, setChosenPackages] = useState<string[]>(
    preselected.filter((code) => packages.some((pkg) => pkg.code === code && !pkg.unpriced)),
  )
  const [chosenAddOns, setChosenAddOns] = useState<string[]>([])
  const [manualDescription, setManualDescription] = useState('')
  const [manualAmount, setManualAmount] = useState('')

  const preview = useMemo(() => {
    const lines: { description: string; amountCents: bigint }[] = []

    for (const code of chosenPackages) {
      const pkg = packages.find((p) => p.code === code)
      if (pkg) lines.push({ description: pkg.name, amountCents: toCents(pkg.price) })
    }
    for (const code of chosenAddOns) {
      const addOn = addOns.find((a) => a.code === code)
      if (addOn) lines.push({ description: addOn.name, amountCents: toCents(addOn.price) })
    }
    const manualCents = manualAmount.trim() ? toCents(manualAmount.trim()) : 0n
    if (manualDescription.trim() && manualCents !== 0n) {
      lines.push({ description: manualDescription.trim(), amountCents: manualCents })
    }

    const chosen = new Set(chosenPackages)
    for (const rule of [...rules].sort((a, b) => a.order - b.order)) {
      const met = rule.requiresAll.every((code) => chosen.has(code))
      const blocked = rule.excludes.some((code) => chosen.has(code))
      if (!met || blocked) continue

      if (rule.target) {
        const targetPackage = packages.find((p) => p.code === rule.target)
        if (!targetPackage || !chosen.has(rule.target)) continue
        const base = toCents(targetPackage.price)
        const amount =
          rule.type === 'PERCENTAGE'
            ? divideHalfUp(base * toCents(rule.value), 10000n)
            : toCents(rule.value)
        if (amount !== 0n) lines.push({ description: rule.name, amountCents: -amount })
      } else {
        const subtotal = lines.reduce((sum, line) => sum + line.amountCents, 0n)
        const amount =
          rule.type === 'PERCENTAGE'
            ? divideHalfUp(subtotal * toCents(rule.value), 10000n)
            : toCents(rule.value)
        if (amount !== 0n) lines.push({ description: rule.name, amountCents: -amount })
      }
    }

    const totalCents = lines.reduce((sum, line) => sum + line.amountCents, 0n)
    return { lines, totalCents, gstCents: divideHalfUp(totalCents, 11n) }
  }, [chosenPackages, chosenAddOns, manualAmount, manualDescription, packages, addOns, rules])

  function togglePackage(code: string) {
    setChosenPackages((current) =>
      current.includes(code) ? current.filter((value) => value !== code) : [...current, code],
    )
  }

  function toggleAddOn(code: string) {
    setChosenAddOns((current) =>
      current.includes(code) ? current.filter((value) => value !== code) : [...current, code],
    )
  }

  return (
    <form action={action} className="grid gap-6 md:grid-cols-3">
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="enquiryId" value={enquiryId} />
      <input type="hidden" name="packageCodes" value={chosenPackages.join(',')} />
      <input type="hidden" name="addOnCodes" value={chosenAddOns.join(',')} />

      <div className="flex flex-col gap-6 md:col-span-2">
        {state.status === 'error' ? <Alert tone="danger" title={state.message} /> : null}
        {state.status === 'blocked' ? (
          <Alert tone="warning" title="This quotation cannot be sent yet">
            <ul className="mt-1 list-disc pl-5">
              {state.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </Alert>
        ) : null}

        <section className="rounded border border-line bg-surface p-5">
          <h2 className="text-lg">Packages</h2>
          <div className="mt-3 flex flex-col">
            {packages.map((pkg) => (
              <label
                key={pkg.code}
                className={`flex items-start justify-between gap-4 border-b border-line py-3 last:border-b-0 ${
                  pkg.unpriced ? 'opacity-60' : ''
                }`}
              >
                <span className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 accent-accent"
                    checked={chosenPackages.includes(pkg.code)}
                    disabled={pkg.unpriced}
                    onChange={() => togglePackage(pkg.code)}
                  />
                  <span>
                    <span className="block text-base text-ink">{pkg.name}</span>
                    <span className="block text-xs text-ink-muted">
                      {pkg.includedHours} {pkg.includedHours === 1 ? 'hour' : 'hours'} · travel
                      within {pkg.includedTravelKm} km
                      {/* BR-X07: an unpriced item is shown with the reason, not hidden. */}
                      {pkg.unpriced ? ' · no published price yet, cannot be quoted' : ''}
                    </span>
                  </span>
                </span>
                <span className="shrink-0 text-base text-ink tabular-nums">
                  {pkg.unpriced ? 'On enquiry' : fromCents(toCents(pkg.price))}
                </span>
              </label>
            ))}
          </div>
        </section>

        <section className="rounded border border-line bg-surface p-5">
          <h2 className="text-lg">Add-ons</h2>
          <div className="mt-3 flex flex-col">
            {addOns.map((addOn) => {

              const needsPackage =
                addOn.requiresAny.length > 0 &&
                !addOn.requiresAny.some((code) => chosenPackages.includes(code))
              const disabled = addOn.unpriced || needsPackage
              return (
                <label
                  key={addOn.code}
                  className={`flex items-start justify-between gap-4 border-b border-line py-3 last:border-b-0 ${
                    disabled ? 'opacity-60' : ''
                  }`}
                >
                  <span className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 accent-accent"
                      checked={chosenAddOns.includes(addOn.code)}
                      disabled={disabled}
                      onChange={() => toggleAddOn(addOn.code)}
                    />
                    <span>
                      <span className="block text-base text-ink">{addOn.name}</span>
                      <span className="block text-xs text-ink-muted">
                        {addOn.unpriced
                          ? 'No published price yet, cannot be quoted'
                          : needsPackage
                            ? `Needs ${addOn.requiresAny.join(' or ')} on the quotation`
                            : addOn.priceAfter
                              ? `${fromCents(toCents(addOn.priceAfter))} if ordered after the shoot`
                              : 'Available'}
                      </span>
                    </span>
                  </span>
                  <span className="shrink-0 text-base text-ink tabular-nums">
                    {addOn.unpriced ? 'On enquiry' : fromCents(toCents(addOn.price))}
                  </span>
                </label>
              )
            })}
          </div>
        </section>

        <section className="rounded border border-line bg-surface p-5">
          <h2 className="text-lg">Add a line by hand</h2>
          <p className="mt-1 text-sm text-ink-muted">
            For travel beyond the included radius, extra hours, or anything quoted for this job.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Field label="Description" htmlFor="manualDescription">
                <TextInput
                  id="manualDescription"
                  name="manualDescription"
                  value={manualDescription}
                  onChange={(event) => setManualDescription(event.target.value)}
                  placeholder="Travel to the Southern Highlands"
                />
              </Field>
            </div>
            <Field label="Amount (AUD)" htmlFor="manualAmount">
              <TextInput
                id="manualAmount"
                name="manualAmount"
                inputMode="decimal"
                value={manualAmount}
                onChange={(event) => setManualAmount(event.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="250.00"
              />
            </Field>
          </div>
        </section>
      </div>

      <aside className="flex flex-col gap-3">
        <div className="rounded border border-line bg-surface p-5">
          <h2 className="text-lg">Running total</h2>
          {preview.lines.length === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">
              Choose a package to start. The total and the GST component update as you go.
            </p>
          ) : (
            <>
              <ul className="mt-3 flex flex-col gap-2">
                {preview.lines.map((line, index) => (
                  <li key={`${line.description}-${index}`} className="flex justify-between gap-3 text-sm">
                    <span className="text-ink">{line.description}</span>
                    <span className="shrink-0 text-ink tabular-nums">{fromCents(line.amountCents)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 border-t border-line pt-3">
                <div className="flex justify-between gap-3">
                  <span className="text-base font-medium text-ink">Total</span>
                  <span className="text-base font-medium text-ink tabular-nums">
                    {fromCents(preview.totalCents)}
                  </span>
                </div>
                {/* §10.4: the GST component stays visible at all times. */}
                <div className="mt-1 flex justify-between gap-3 text-sm text-ink-muted">
                  <span>Includes GST</span>
                  <span className="tabular-nums">{fromCents(preview.gstCents)}</span>
                </div>
              </div>
            </>
          )}
        </div>

        <Button type="submit" loading={pending} disabled={preview.lines.length === 0} className="w-full">
          Create the quotation
        </Button>
        <p className="text-xs text-ink-muted">
          Saved as a draft first. You review it, then send it to the client.
        </p>
      </aside>
    </form>
  )
}
