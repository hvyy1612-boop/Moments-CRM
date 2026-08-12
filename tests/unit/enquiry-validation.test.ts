import { describe, it, expect } from 'vitest'
import { enquiryInputSchema } from '@/lib/validation/enquiry'

describe('enquiry input validation (BR-E01)', () => {
  const valid = {
    primaryName: 'Aisha',
    email: 'aisha@example.com',
    enquiryType: 'WEDDING',
    eventDate: '2027-03-14',
  }

  it('BR-E01 accepts an enquiry with the required fields', () => {
    expect(enquiryInputSchema.safeParse(valid).success).toBe(true)
  })

  it('BR-E01 rejects a blank primary name', () => {
    expect(enquiryInputSchema.safeParse({ ...valid, primaryName: '' }).success).toBe(false)
  })

  it('BR-E01 rejects an invalid email', () => {
    expect(enquiryInputSchema.safeParse({ ...valid, email: 'not an email' }).success).toBe(false)
  })

  it('BR-E01 rejects a missing event date', () => {
    const withoutDate = {
      primaryName: 'Aisha',
      email: 'aisha@example.com',
      enquiryType: 'WEDDING',
    }
    expect(enquiryInputSchema.safeParse(withoutDate).success).toBe(false)
  })

  it('marketing consent defaults to false when it is not sent (PRIV-02)', () => {
    const result = enquiryInputSchema.safeParse(valid)
    expect(result.success && result.data.marketingConsent).toBe(false)
  })
})
