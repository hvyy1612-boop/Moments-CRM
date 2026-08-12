import { Prisma } from '@prisma/client'
import type { DiscountType, SourceType } from '@prisma/client'
import { isPeakSeason } from '@/lib/time'

export function roundMoney(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
}

export function gstFromGross(totalGross: Prisma.Decimal): Prisma.Decimal {
  return roundMoney(totalGross.dividedBy(11))
}

export function isPlaceholderPrice(value: Prisma.Decimal): boolean {
  return value.isZero()
}

export type CataloguePackage = {
  id: string
  code: string
  name: string
  description: string
  priceGross: Prisma.Decimal
  includedHours: number
  includedTravelKm: number
  maxExtraHours: number
  isActive: boolean
}

export type CatalogueAddOn = {
  id: string
  code: string
  name: string
  description: string
  priceGrossBefore: Prisma.Decimal
  priceGrossAfter: Prisma.Decimal | null
  isActive: boolean
  rules: { requiresAnyPackageId: string[]; excludesPackageId: string[] }[]
}

export type CataloguePricingRule = {
  id: string
  code: string
  name: string
  requiresAllPackageId: string[]
  excludesPackageId: string[]
  appliesToTargetId: string | null
  discountType: DiscountType
  discountValue: Prisma.Decimal
  evaluationOrder: number
  isActive: boolean
  validFrom: Date | null
  validTo: Date | null
}

export type Catalogue = {
  packages: CataloguePackage[]
  addOns: CatalogueAddOn[]
  rules: CataloguePricingRule[]
}

export type Selection = {
  packageCodes: string[]
  addOns: { code: string; quantity: number }[]

  manualLines: { description: string; unitPriceGross: Prisma.Decimal; quantity: number }[]
  venueDistanceKm: Prisma.Decimal | null

  quotationDate: Date
  shootDate: Date
}

export type PricedLine = {
  sourceType: SourceType
  sourceId: string | null
  description: string
  unitPriceGross: Prisma.Decimal
  quantity: number
  lineTotalGross: Prisma.Decimal
  appliedRuleId: string | null
  displayOrder: number
}

export type PricingResult = {
  lines: PricedLine[]
  totalGross: Prisma.Decimal
  gstAmount: Prisma.Decimal

  requiresManualPricing: boolean

  warnings: string[]

  blockers: string[]
}

const ZERO = new Prisma.Decimal(0)

export function priceQuotation(catalogue: Catalogue, selection: Selection): PricingResult {
  const lines: PricedLine[] = []
  const warnings: string[] = []
  const blockers: string[] = []
  let order = 0

  const packageByCode = new Map(catalogue.packages.map((p) => [p.code, p]))
  const chosenPackages = selection.packageCodes
    .map((code) => packageByCode.get(code))
    .filter((p): p is CataloguePackage => Boolean(p))
  const chosenCodes = new Set(chosenPackages.map((p) => p.code))

  for (const pkg of chosenPackages) {

    if (!pkg.isActive) {
      blockers.push(`${pkg.name} is no longer offered and cannot be added.`)
      continue
    }

    if (isPlaceholderPrice(pkg.priceGross)) {
      blockers.push(`${pkg.name} has no published price yet, so it cannot be quoted.`)
    }
    lines.push({
      sourceType: 'PACKAGE',
      sourceId: pkg.id,
      description: pkg.name, // BR-P10 snapshot
      unitPriceGross: pkg.priceGross,
      quantity: 1,
      lineTotalGross: pkg.priceGross,
      appliedRuleId: null,
      displayOrder: order++,
    })
  }

  const addOnByCode = new Map(catalogue.addOns.map((a) => [a.code, a]))
  for (const chosen of selection.addOns) {
    const addOn = addOnByCode.get(chosen.code)
    if (!addOn) continue
    const quantity = Math.max(1, Math.trunc(chosen.quantity))

    if (!addOn.isActive) {
      blockers.push(`${addOn.name} is no longer offered and cannot be added.`)
      continue
    }

    for (const rule of addOn.rules) {
      if (rule.requiresAnyPackageId.length > 0) {
        const satisfied = rule.requiresAnyPackageId.some((code) => chosenCodes.has(code))
        if (!satisfied) {
          blockers.push(
            `${addOn.name} needs one of these packages on the quotation: ${rule.requiresAnyPackageId.join(', ')}.`,
          )
        }
      }
      const clash = rule.excludesPackageId.find((code) => chosenCodes.has(code))
      if (clash) {
        blockers.push(`${addOn.name} cannot be combined with ${clash}.`)
      }
    }

    const afterShoot = selection.quotationDate.getTime() > selection.shootDate.getTime()
    const unitPrice =
      afterShoot && addOn.priceGrossAfter !== null ? addOn.priceGrossAfter : addOn.priceGrossBefore

    if (isPlaceholderPrice(unitPrice)) {

      blockers.push(`${addOn.name} has no published price yet, so it cannot be quoted.`)
    }

    lines.push({
      sourceType: 'ADDON',
      sourceId: addOn.id,
      description: afterShoot && addOn.priceGrossAfter !== null ? `${addOn.name} (after the shoot)` : addOn.name,
      unitPriceGross: unitPrice,
      quantity,
      lineTotalGross: roundMoney(unitPrice.times(quantity)),
      appliedRuleId: null,
      displayOrder: order++,
    })
  }

  for (const manual of selection.manualLines) {
    const quantity = Math.max(1, Math.trunc(manual.quantity))
    lines.push({
      sourceType: 'MANUAL',
      sourceId: null,
      description: manual.description,
      unitPriceGross: manual.unitPriceGross,
      quantity,
      lineTotalGross: roundMoney(manual.unitPriceGross.times(quantity)),
      appliedRuleId: null,
      displayOrder: order++,
    })
  }

  const applicable = catalogue.rules
    .filter((rule) => rule.isActive)
    .filter((rule) => withinValidity(rule, selection.quotationDate))
    .sort((a, b) => a.evaluationOrder - b.evaluationOrder)

  for (const rule of applicable) {
    const requiresMet = rule.requiresAllPackageId.every((code) => chosenCodes.has(code))
    const excluded = rule.excludesPackageId.some((code) => chosenCodes.has(code))
    if (!requiresMet || excluded) continue

    const target = rule.appliesToTargetId
    if (target) {
      const targetLine = lines.find(
        (line) => line.sourceType === 'PACKAGE' && packageByCode.get(target)?.id === line.sourceId,
      )
      if (!targetLine) continue
      const amount = discountAmount(rule, targetLine.lineTotalGross)
      if (amount.isZero()) continue
      lines.push(discountLine(rule, amount, order++))
    } else {
      const subtotal = lines.reduce((sum, line) => sum.plus(line.lineTotalGross), ZERO)
      const amount = discountAmount(rule, subtotal)
      if (amount.isZero()) continue
      lines.push(discountLine(rule, amount, order++))
    }
  }

  let requiresManualPricing = false
  if (selection.venueDistanceKm && chosenPackages.length > 0) {
    const highestValue = chosenPackages.reduce((best, pkg) =>
      pkg.priceGross.greaterThan(best.priceGross) ? pkg : best,
    )
    if (selection.venueDistanceKm.greaterThan(highestValue.includedTravelKm)) {
      const hasTravelLine = selection.manualLines.length > 0
      requiresManualPricing = !hasTravelLine
      warnings.push(
        `The venue is ${selection.venueDistanceKm.toFixed(1)} km away and ${highestValue.name} includes ${highestValue.includedTravelKm} km. Add a travel line before sending.`,
      )
    }
  }

  const totalGross = roundMoney(lines.reduce((sum, line) => sum.plus(line.lineTotalGross), ZERO))

  return {
    lines,
    totalGross,
    gstAmount: gstFromGross(totalGross), // BR-P02 from the total, not per line
    requiresManualPricing,
    warnings,
    blockers,
  }
}

function withinValidity(rule: CataloguePricingRule, on: Date): boolean {
  if (rule.validFrom && on.getTime() < rule.validFrom.getTime()) return false
  if (rule.validTo && on.getTime() > rule.validTo.getTime()) return false
  return true
}

function discountAmount(rule: CataloguePricingRule, base: Prisma.Decimal): Prisma.Decimal {
  if (rule.discountType === 'PERCENTAGE') {
    return roundMoney(base.times(rule.discountValue).dividedBy(100))
  }
  return roundMoney(rule.discountValue)
}

function discountLine(rule: CataloguePricingRule, amount: Prisma.Decimal, displayOrder: number): PricedLine {
  const negative = amount.negated()
  return {
    sourceType: 'RULE',
    sourceId: null,
    description: rule.name, // BR-P10 snapshot of the wording at the time
    unitPriceGross: negative,
    quantity: 1,
    lineTotalGross: negative,
    appliedRuleId: rule.id,
    displayOrder,
  }
}

export const DELIVERABLE_DAYS: Record<string, number> = {
  SNEAK_PEEK: 3,
  PHOTO_GALLERY: 120,
  VIDEO_FILM: 240,
  ALBUM: 150,
  FILM_SCANS: 45,
  PORTRAIT_GALLERY: 28,
  RAW_FOOTAGE: 30,
}

const PEAK_EXTENDED = new Set(['PHOTO_GALLERY', 'VIDEO_FILM'])

export function deliverableDueDate(type: string, shootDate: Date): Date {
  const base = DELIVERABLE_DAYS[type] ?? 30
  const peakExtra = PEAK_EXTENDED.has(type) && isPeakSeason(shootDate) ? 30 : 0
  const due = new Date(shootDate)
  due.setDate(due.getDate() + base + peakExtra)
  return due
}

export function bookingFeeAmount(totalGross: Prisma.Decimal): Prisma.Decimal {
  return roundMoney(totalGross.times(20).dividedBy(100))
}
