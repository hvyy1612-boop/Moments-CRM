/**
 * Demo data for testing the QUOTES stage. Five wedding couples, each created as a real
 * Client -> Enquiry -> Quote and driven through the actual domain functions so every quote state is
 * consistent and behaves exactly like the app made it:
 *
 *   Q (Draft)     - not sent yet            -> test Edit / Send quote / Preview
 *   Q (Sent)      - waiting on the client   -> test Mark as accepted / Edit(revise) / Declined / Preview
 *   Q (Viewed)    - client opened the link  -> same actions, shows the Viewed state
 *   Q (Accepted)  - accepted -> Job created -> test the read-only accepted quote + linked job
 *   Q (Declined)  - client said no          -> test Edit(revise) / Preview
 *
 * Every client email ends in @demo.moments so the set is easy to find and remove later. Idempotent:
 * running it again detects the sentinel client and skips. Writes wherever DATABASE_URL points.
 *
 *   npm run seed:demo:quotes
 */
import { prisma } from '../src/lib/db'
import { createClient } from '../src/lib/domain/client'
import { createEnquiry } from '../src/lib/domain/enquiry'
import {
  acceptQuote,
  createQuoteForEnquiry,
  declineQuote,
  markQuoteViewed,
  saveQuoteDraft,
  sendQuote,
} from '../src/lib/domain/quote'
import type { QuoteLineInput } from '../src/lib/validation/quote'
import type { DeclineReason } from '@prisma/client'

type FinalState = 'DRAFT' | 'SENT' | 'VIEWED' | 'ACCEPTED' | 'DECLINED'

type DemoCase = {
  firstName: string
  lastName: string
  email: string
  phone: string
  suburb: string
  state: string
  eventType: string
  eventDate: Date
  message: string
  lines: QuoteLineInput[]
  introduction: string
  notes: string
  depositPercent: number
  issueDate: Date
  validUntil: Date
  final: FinalState
  declineReason?: DeclineReason
}

const INTRO =
  'Thank you for considering Moments Photography & Film for your wedding. Below is a tailored quote for your day - we would love to be part of it.'
const TERMS =
  'A 30% booking deposit secures your date; the balance is due two weeks before the event. All prices include GST.'
const ISSUE = new Date('2026-09-20T00:00:00+10:00')
const VALID = new Date('2026-10-25T00:00:00+10:00') // future, so an Accepted quote is not treated as expired

const CASES: DemoCase[] = [
  {
    firstName: 'Emma & Oliver', lastName: 'Bennett', email: 'emma.oliver@demo.moments', phone: '0412 555 201',
    suburb: 'Bondi', state: 'NSW', eventType: 'Wedding', eventDate: new Date('2027-03-14T00:00:00+11:00'),
    message: 'Garden ceremony at Centennial Park, about 80 guests. Still comparing collections.',
    lines: [
      { description: 'Essential Collection - 6 hours coverage', lineType: 'package', quantity: 1, unitPrice: '3200', details: 'Up to 6 hours on the day\nOne lead photographer\n400+ edited images\nOnline gallery' },
      { description: 'Extra hour of coverage', lineType: 'addon', quantity: 1, unitPrice: '350' },
    ],
    introduction: INTRO, notes: TERMS, depositPercent: 30, issueDate: ISSUE, validUntil: VALID, final: 'DRAFT',
  },
  {
    firstName: 'Grace & Liam', lastName: 'Carter', email: 'grace.liam@demo.moments', phone: '0412 555 202',
    suburb: 'Surry Hills', state: 'NSW', eventType: 'Wedding', eventDate: new Date('2027-04-11T00:00:00+11:00'),
    message: 'City Hall ceremony, reception in Surry Hills. Keen to lock in soon.',
    lines: [
      { description: 'Signature Collection - 8 hours coverage', lineType: 'package', quantity: 1, unitPrice: '4500', details: 'Up to 8 hours on the day\nTwo photographers\n600+ edited images\nOnline gallery\nSneak peek within 48 hours' },
      { description: 'Engagement session', lineType: 'addon', quantity: 1, unitPrice: '650', details: '1-hour pre-wedding shoot at a location of your choice' },
      { description: 'Fine-art album 30x30cm', lineType: 'addon', quantity: 1, unitPrice: '890' },
    ],
    introduction: INTRO, notes: TERMS, depositPercent: 30, issueDate: ISSUE, validUntil: VALID, final: 'SENT',
  },
  {
    firstName: 'Chloe & Noah', lastName: 'Davies', email: 'chloe.noah@demo.moments', phone: '0412 555 203',
    suburb: 'Manly', state: 'NSW', eventType: 'Wedding', eventDate: new Date('2027-05-02T00:00:00+11:00'),
    message: 'Beachside ceremony at Manly, 120 guests. Reviewing the quote now.',
    lines: [
      { description: 'Luxury Collection - 10 hours + second shooter', lineType: 'package', quantity: 1, unitPrice: '6800', details: 'Up to 10 hours on the day\nTwo photographers\n800+ edited images\nOnline gallery\nEngagement session included' },
      { description: 'Drone coverage', lineType: 'addon', quantity: 1, unitPrice: '450' },
    ],
    introduction: INTRO, notes: TERMS, depositPercent: 30, issueDate: ISSUE, validUntil: VALID, final: 'VIEWED',
  },
  {
    firstName: 'Zoe & Ethan', lastName: 'Foster', email: 'zoe.ethan@demo.moments', phone: '0412 555 204',
    suburb: 'Paddington', state: 'NSW', eventType: 'Wedding', eventDate: new Date('2027-06-13T00:00:00+11:00'),
    message: 'Ready to book - happy with the signature collection.',
    lines: [
      { description: 'Signature Collection - 8 hours coverage', lineType: 'package', quantity: 1, unitPrice: '4500', details: 'Up to 8 hours on the day\nTwo photographers\n600+ edited images\nOnline gallery' },
      { description: 'Second photographer', lineType: 'addon', quantity: 1, unitPrice: '950' },
      { description: 'Premium album 30x30cm', lineType: 'addon', quantity: 1, unitPrice: '890' },
    ],
    introduction: INTRO, notes: TERMS, depositPercent: 30, issueDate: ISSUE, validUntil: VALID, final: 'ACCEPTED',
  },
  {
    firstName: 'Mia & Lucas', lastName: 'Grant', email: 'mia.lucas@demo.moments', phone: '0412 555 205',
    suburb: 'Newtown', state: 'NSW', eventType: 'Wedding', eventDate: new Date('2027-02-21T00:00:00+11:00'),
    message: 'Small registry wedding. Ended up going with a friend.',
    lines: [
      { description: 'Essential Collection - 6 hours coverage', lineType: 'package', quantity: 1, unitPrice: '3200', details: 'Up to 6 hours on the day\nOne lead photographer\n400+ edited images\nOnline gallery' },
    ],
    introduction: INTRO, notes: TERMS, depositPercent: 30, issueDate: ISSUE, validUntil: VALID, final: 'DECLINED', declineReason: 'CHOSE_ANOTHER',
  },
]

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } })
  if (!admin) throw new Error('No ADMIN user found - cannot attribute the demo data.')
  const actorId = admin.id

  const sentinelEmail = CASES[0]!.email
  const sentinel = await prisma.client.findUnique({ where: { email: sentinelEmail } })
  if (sentinel) {
    console.log('Quote demo data already present (found ' + sentinelEmail + ') - skipping.')
    return
  }

  console.log('Seeding ' + CASES.length + ' demo quotes ...')
  for (const c of CASES) {
    const client = await createClient(
      { firstName: c.firstName, lastName: c.lastName, email: c.email, phone: c.phone, suburb: c.suburb, state: c.state, country: 'Australia', isCompany: false },
      actorId,
    )
    const enquiry = await createEnquiry(
      { name: c.firstName + ' ' + c.lastName, email: c.email, phone: c.phone, clientId: client.id, eventType: c.eventType, eventDate: c.eventDate, message: c.message, source: 'MANUAL' },
      actorId,
    )
    const { quoteId, versionId } = await createQuoteForEnquiry(enquiry.id, actorId)
    await saveQuoteDraft(versionId, c.lines, c.validUntil, {
      introduction: c.introduction, notes: c.notes, depositPercent: c.depositPercent, issueDate: c.issueDate,
    })

    if (c.final === 'DRAFT') {
      console.log('  DRAFT     ' + c.firstName + ' ' + c.lastName)
      continue
    }

    await sendQuote(quoteId, actorId)
    if (c.final === 'SENT') {
      console.log('  SENT      ' + c.firstName + ' ' + c.lastName)
      continue
    }
    if (c.final === 'VIEWED') {
      const q = await prisma.quote.findUnique({ where: { id: quoteId }, select: { viewToken: true } })
      if (q?.viewToken) await markQuoteViewed(q.viewToken)
      console.log('  VIEWED    ' + c.firstName + ' ' + c.lastName)
      continue
    }
    if (c.final === 'ACCEPTED') {
      const res = await acceptQuote(quoteId, actorId)
      console.log('  ACCEPTED  ' + c.firstName + ' ' + c.lastName + ' -> Job ' + res.projectId)
      continue
    }
    if (c.final === 'DECLINED') {
      await declineQuote(quoteId, c.declineReason ?? 'OTHER', actorId)
      console.log('  DECLINED  ' + c.firstName + ' ' + c.lastName)
    }
  }
  console.log('Done.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
