import type { ClientSource, ClientStatus, EnquirySource } from '@prisma/client'

export function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return ''
  const digits = phone.replace(/\D/g, '')
  return digits.length > 9 ? digits.slice(-9) : digits
}

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
