import type { ClientSource, ClientStatus, EnquirySource } from '@prisma/client'

// Pure dedup/matching helpers (no database). Kept apart from enquiry.ts so they unit-test without a
// Prisma client. See docs/18 (§C) and F-ENQ-05 for the "auto-match, never auto-merge" rule.

/** Normalise a phone to its last 9 digits so +61 4xx / 04xx / spaced forms compare equal. */
export function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return ''
  const digits = phone.replace(/\D/g, '')
  return digits.length > 9 ? digits.slice(-9) : digits
}

/** When a lead converts, the new client's acquisition source follows the lead's channel. */
export function clientSourceFromEnquiry(source: EnquirySource): ClientSource {
  switch (source) {
    case 'REFERRAL':
      return 'REFERRAL'
    case 'MANUAL':
      return 'MANUAL'
    default:
      return 'ENQUIRY'
  }
}

export type ClientMatch = {
  id: string
  displayName: string
  email: string
  phone: string | null
  status: ClientStatus
}

/**
 * Dedup tier 2 (pure): from a candidate set, keep clients that share the enquirer's name
 * (case-insensitive) or normalised phone. Only *suggests* to staff - never auto-merges.
 */
export function rankPossibleMatches(
  input: { name?: string | null; phone?: string | null },
  candidates: ClientMatch[],
  excludeId?: string,
): ClientMatch[] {
  const name = input.name?.trim().toLowerCase()
  const normPhone = normalizePhone(input.phone)
  const seen = new Set<string>(excludeId ? [excludeId] : [])
  const matches: ClientMatch[] = []
  for (const candidate of candidates) {
    if (seen.has(candidate.id)) continue
    const byName = !!name && candidate.displayName.trim().toLowerCase() === name
    const byPhone = !!normPhone && normalizePhone(candidate.phone) === normPhone
    if (byName || byPhone) {
      seen.add(candidate.id)
      matches.push(candidate)
    }
  }
  return matches
}
