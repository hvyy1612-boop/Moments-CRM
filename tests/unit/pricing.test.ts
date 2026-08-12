import { Prisma } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import {
  bookingFeeAmount,
  deliverableDueDate,
  gstFromGross,
  priceQuotation,
  roundMoney,
  type Catalogue,
  type Selection,
} from '@/lib/domain/pricing'
import { formatSydneyDate } from '@/lib/time'

const dec = (value: string) => new Prisma.Decimal(value)

const CATALOGUE: Catalogue = {
  packages: [
    {
      id: 'pkg-wed-photo',
      code: 'WED-PHOTO',
      name: 'Wedding Photography',
      description: '',
      priceGross: dec('3500.00'),
      includedHours: 6,
      includedTravelKm: 100,
      maxExtraHours: 4,
      isActive: true,
    },
    {
      id: 'pkg-wed-video',
      code: 'WED-VIDEO',
      name: 'Wedding Videography',
      description: '',
      priceGross: dec('4500.00'),
      includedHours: 6,
      includedTravelKm: 100,
      maxExtraHours: 4,
      isActive: true,
    },
    {
      id: 'pkg-micro-photo',
      code: 'MICRO-PHOTO',
      name: 'Micro wedding or Elopement',
      description: '',
      priceGross: dec('1500.00'),
      includedHours: 2,
      includedTravelKm: 50,
      maxExtraHours: 0,
      isActive: true,
    },
    {
      id: 'pkg-pre-wed',
      code: 'PRE-WED',
      name: 'Engagement session',
      description: '',
      priceGross: dec('850.00'),
      includedHours: 1,
      includedTravelKm: 50,
      maxExtraHours: 0,
      isActive: true,
    },
    {
      id: 'pkg-retired',
      code: 'RETIRED',
      name: 'Retired package',
      description: '',
      priceGross: dec('1000.00'),
      includedHours: 1,
      includedTravelKm: 50,
      maxExtraHours: 0,
      isActive: false,
    },
  ],
  addOns: [
    {
      id: 'add-album',
      code: 'ALBUM',
      name: 'Wedding album',
      description: '',
      priceGrossBefore: dec('1200.00'),
      priceGrossAfter: dec('1400.00'),
      isActive: true,
      rules: [{ requiresAnyPackageId: ['WED-PHOTO', 'MICRO-PHOTO'], excludesPackageId: [] }],
    },
    {
      id: 'add-second',
      code: 'SECOND-SH',
      name: 'Second shooter',
      description: '',
      priceGrossBefore: dec('0.00'), // placeholder, OQ-003
      priceGrossAfter: null,
      isActive: true,
      rules: [],
    },
    {
      id: 'add-drone',
      code: 'DRONE',
      name: 'Drone coverage',
      description: '',
      priceGrossBefore: dec('400.00'),
      priceGrossAfter: null,
      isActive: true,
      rules: [],
    },
  ],
  rules: [
    {
      id: 'rule-bundle',
      code: 'BUNDLE-PV',
      name: 'Photo and video bundle',
      requiresAllPackageId: ['WED-PHOTO', 'WED-VIDEO'],
      excludesPackageId: [],
      appliesToTargetId: null,
      discountType: 'FIXED',
      discountValue: dec('150.00'),
      evaluationOrder: 1,
      isActive: true,
      validFrom: null,
      validTo: null,
    },
    {
      id: 'rule-prewed',
      code: 'COND-PREWED',
      name: 'Engagement session discount',
      requiresAllPackageId: ['WED-PHOTO'],
      excludesPackageId: ['MICRO-PHOTO'],
      appliesToTargetId: 'PRE-WED',
      discountType: 'PERCENTAGE',
      discountValue: dec('20'),
      evaluationOrder: 2,
      isActive: true,
      validFrom: null,
      validTo: null,
    },
  ],
}

const SHOOT = new Date('2027-03-13T00:00:00+11:00')
const QUOTED_BEFORE = new Date('2026-08-12T00:00:00+10:00')

function select(overrides: Partial<Selection> = {}): Selection {
  return {
    packageCodes: [],
    addOns: [],
    manualLines: [],
    venueDistanceKm: null,
    quotationDate: QUOTED_BEFORE,
    shootDate: SHOOT,
    ...overrides,
  }
}

describe('rounding and GST (BR-P02, BR-X03)', () => {
  it('BR-X03 rounds half-up, not half-even', () => {
    expect(roundMoney(dec('1.005')).toFixed(2)).toBe('1.01')
    expect(roundMoney(dec('2.675')).toFixed(2)).toBe('2.68')
    expect(roundMoney(dec('1.014')).toFixed(2)).toBe('1.01')
  })

  it('BR-P02 divides the gross by 11 rather than multiplying by 0.10', () => {
    // $3,500 inc GST: the GST component is 3500/11 = 318.1818..., not 350.
    expect(gstFromGross(dec('3500.00')).toFixed(2)).toBe('318.18')
    expect(gstFromGross(dec('7850.00')).toFixed(2)).toBe('713.64')
  })

  it('BR-X03 takes GST from the total, so it never drifts from the sum of the lines', () => {
    const result = priceQuotation(
      CATALOGUE,
      select({ packageCodes: ['WED-PHOTO', 'WED-VIDEO'] }),
    )
    expect(result.totalGross.toFixed(2)).toBe('7850.00')
    expect(result.gstAmount.toFixed(2)).toBe('713.64')
  })
})

describe('pricing rules (BR-P06, BR-P07, BR-P08)', () => {
  it('BR-P07 takes $150 off once when both wedding packages are present', () => {
    const result = priceQuotation(CATALOGUE, select({ packageCodes: ['WED-PHOTO', 'WED-VIDEO'] }))
    const discounts = result.lines.filter((line) => line.appliedRuleId === 'rule-bundle')
    expect(discounts).toHaveLength(1)
    expect(discounts[0]?.lineTotalGross.toFixed(2)).toBe('-150.00')
    // 3500 + 4500 - 150
    expect(result.totalGross.toFixed(2)).toBe('7850.00')
  })

  it('BR-P07 does not apply when only the photography package is present', () => {
    const result = priceQuotation(CATALOGUE, select({ packageCodes: ['WED-PHOTO'] }))
    expect(result.lines.some((line) => line.appliedRuleId === 'rule-bundle')).toBe(false)
    expect(result.totalGross.toFixed(2)).toBe('3500.00')
  })

  it('BR-P08 takes 20% off the engagement session when wedding photography is present', () => {
    const result = priceQuotation(CATALOGUE, select({ packageCodes: ['WED-PHOTO', 'PRE-WED'] }))
    const discount = result.lines.find((line) => line.appliedRuleId === 'rule-prewed')
    // 20% of 850 = 170, applied to the PRE-WED line only, never to the whole quotation.
    expect(discount?.lineTotalGross.toFixed(2)).toBe('-170.00')
    expect(result.totalGross.toFixed(2)).toBe('4180.00')
  })

  it('BR-P08 is blocked when the micro package is present', () => {
    const result = priceQuotation(
      CATALOGUE,
      select({ packageCodes: ['WED-PHOTO', 'PRE-WED', 'MICRO-PHOTO'] }),
    )
    expect(result.lines.some((line) => line.appliedRuleId === 'rule-prewed')).toBe(false)
  })

  it('BR-P08 does not apply without wedding photography', () => {
    const result = priceQuotation(CATALOGUE, select({ packageCodes: ['PRE-WED'] }))
    expect(result.lines.some((line) => line.appliedRuleId === 'rule-prewed')).toBe(false)
    expect(result.totalGross.toFixed(2)).toBe('850.00')
  })

  it('BR-P06 applies each rule at most once and in evaluationOrder', () => {
    const result = priceQuotation(
      CATALOGUE,
      select({ packageCodes: ['WED-PHOTO', 'WED-VIDEO', 'PRE-WED'] }),
    )
    const ruleLines = result.lines.filter((line) => line.sourceType === 'RULE')
    expect(ruleLines).toHaveLength(2)
    expect(ruleLines[0]?.appliedRuleId).toBe('rule-bundle') // evaluationOrder 1
    expect(ruleLines[1]?.appliedRuleId).toBe('rule-prewed') // evaluationOrder 2
    // 3500 + 4500 + 850 - 150 - 170
    expect(result.totalGross.toFixed(2)).toBe('8530.00')
  })

  it('an inactive rule never applies', () => {
    const paused: Catalogue = {
      ...CATALOGUE,
      rules: CATALOGUE.rules.map((rule) => ({ ...rule, isActive: false })),
    }
    const result = priceQuotation(paused, select({ packageCodes: ['WED-PHOTO', 'WED-VIDEO'] }))
    expect(result.totalGross.toFixed(2)).toBe('8000.00')
  })

  it('a rule outside its validity window never applies', () => {
    const expired: Catalogue = {
      ...CATALOGUE,
      rules: CATALOGUE.rules.map((rule) => ({ ...rule, validTo: new Date('2026-01-01') })),
    }
    const result = priceQuotation(expired, select({ packageCodes: ['WED-PHOTO', 'WED-VIDEO'] }))
    expect(result.totalGross.toFixed(2)).toBe('8000.00')
  })
})

describe('add-ons (BR-P04, BR-P05, BR-X06, BR-X07)', () => {
  it('BR-P04 blocks an add-on whose required package is missing', () => {
    const result = priceQuotation(
      CATALOGUE,
      select({ packageCodes: ['WED-VIDEO'], addOns: [{ code: 'ALBUM', quantity: 1 }] }),
    )
    expect(result.blockers.join(' ')).toMatch(/Wedding album needs one of these packages/)
  })

  it('BR-P04 allows the add-on once a required package is present', () => {
    const result = priceQuotation(
      CATALOGUE,
      select({ packageCodes: ['WED-PHOTO'], addOns: [{ code: 'ALBUM', quantity: 1 }] }),
    )
    expect(result.blockers).toEqual([])
    expect(result.totalGross.toFixed(2)).toBe('4700.00')
  })

  it('BR-P05 uses the before price when the quotation predates the shoot', () => {
    const result = priceQuotation(
      CATALOGUE,
      select({ packageCodes: ['WED-PHOTO'], addOns: [{ code: 'ALBUM', quantity: 1 }] }),
    )
    const album = result.lines.find((line) => line.sourceId === 'add-album')
    expect(album?.unitPriceGross.toFixed(2)).toBe('1200.00')
  })

  it('BR-P05 uses the after price when the quotation is created past the shoot date', () => {
    const result = priceQuotation(
      CATALOGUE,
      select({
        packageCodes: ['WED-PHOTO'],
        addOns: [{ code: 'ALBUM', quantity: 1 }],
        quotationDate: new Date('2027-04-01T00:00:00+10:00'),
      }),
    )
    const album = result.lines.find((line) => line.sourceId === 'add-album')
    expect(album?.unitPriceGross.toFixed(2)).toBe('1400.00')
    expect(album?.description).toContain('after the shoot')
  })

  it('BR-X07 blocks an add-on whose price is still a placeholder', () => {
    const result = priceQuotation(
      CATALOGUE,
      select({ packageCodes: ['WED-PHOTO'], addOns: [{ code: 'SECOND-SH', quantity: 1 }] }),
    )
    expect(result.blockers.join(' ')).toMatch(/Second shooter has no published price/)
  })

  it('BR-X06 blocks a package that has been retired', () => {
    const result = priceQuotation(CATALOGUE, select({ packageCodes: ['RETIRED'] }))
    expect(result.blockers.join(' ')).toMatch(/no longer offered/)
  })

  it('multiplies an add-on by its quantity', () => {
    const result = priceQuotation(
      CATALOGUE,
      select({ packageCodes: ['WED-PHOTO'], addOns: [{ code: 'DRONE', quantity: 3 }] }),
    )
    const drone = result.lines.find((line) => line.sourceId === 'add-drone')
    expect(drone?.lineTotalGross.toFixed(2)).toBe('1200.00')
  })
})

describe('travel (BR-P09)', () => {
  it('BR-P09 flags manual pricing when the venue is beyond the included radius', () => {
    const result = priceQuotation(
      CATALOGUE,
      select({ packageCodes: ['WED-PHOTO'], venueDistanceKm: dec('180.0') }),
    )
    expect(result.requiresManualPricing).toBe(true)
    expect(result.warnings.join(' ')).toMatch(/180.0 km/)
  })

  it('BR-P09 clears once a travel line has been added by hand', () => {
    const result = priceQuotation(
      CATALOGUE,
      select({
        packageCodes: ['WED-PHOTO'],
        venueDistanceKm: dec('180.0'),
        manualLines: [{ description: 'Travel to Southern Highlands', unitPriceGross: dec('250.00'), quantity: 1 }],
      }),
    )
    expect(result.requiresManualPricing).toBe(false)
    expect(result.totalGross.toFixed(2)).toBe('3750.00')
  })

  it('BR-P09 measures against the highest-value package on the quotation', () => {
    // MICRO-PHOTO includes 50 km, WED-PHOTO includes 100 km. At 80 km the higher-value package
    // covers it, so nothing is flagged.
    const result = priceQuotation(
      CATALOGUE,
      select({ packageCodes: ['MICRO-PHOTO', 'WED-PHOTO'], venueDistanceKm: dec('80.0') }),
    )
    expect(result.requiresManualPricing).toBe(false)
  })
})

describe('deliverable due dates (BR-D02, BR-D03)', () => {
  it('BR-D02 uses the published offsets from the shoot date', () => {
    // Asserted through the Sydney formatter, which is the date the studio actually sees. Comparing
    // against a UTC calendar literal would be the mistake BR-X01 warns about.
    const shoot = new Date('2027-06-12T00:00:00+10:00') // June, off peak
    // en-AU abbreviates June, July and Sept in full, which is the Australian convention.
    expect(formatSydneyDate(deliverableDueDate('SNEAK_PEEK', shoot))).toBe('15 June 2027')
    expect(formatSydneyDate(deliverableDueDate('PHOTO_GALLERY', shoot))).toBe('10 Oct 2027')
    expect(formatSydneyDate(deliverableDueDate('PORTRAIT_GALLERY', shoot))).toBe('10 July 2027')
  })

  it('BR-D03 adds 30 days to the gallery and the film for a peak season shoot', () => {
    const peak = new Date('2027-03-13T00:00:00+11:00') // March, peak
    const offPeak = new Date('2027-06-12T00:00:00+10:00')
    const peakGallery = deliverableDueDate('PHOTO_GALLERY', peak).getTime()
    const peakShoot = peak.getTime()
    const offGallery = deliverableDueDate('PHOTO_GALLERY', offPeak).getTime()
    const offShoot = offPeak.getTime()
    const day = 24 * 60 * 60 * 1000
    expect(Math.round((peakGallery - peakShoot) / day)).toBe(150)
    expect(Math.round((offGallery - offShoot) / day)).toBe(120)
  })

  it('BR-D03 leaves the sneak peek alone in peak season', () => {
    const peak = new Date('2027-03-13T00:00:00+11:00')
    const day = 24 * 60 * 60 * 1000
    expect(Math.round((deliverableDueDate('SNEAK_PEEK', peak).getTime() - peak.getTime()) / day)).toBe(3)
  })
})

describe('booking fee (BR-I01)', () => {
  it('BR-I01 is 20% of the total, rounded once', () => {
    expect(bookingFeeAmount(dec('7850.00')).toFixed(2)).toBe('1570.00')
    expect(bookingFeeAmount(dec('4180.00')).toFixed(2)).toBe('836.00')
    // 20% of 1234.57 = 246.914 -> 246.91
    expect(bookingFeeAmount(dec('1234.57')).toFixed(2)).toBe('246.91')
  })
})
