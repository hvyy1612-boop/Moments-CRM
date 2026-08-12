import { z } from 'zod'

// The fixed list of enquiry types the studio takes. Weddings, micro weddings and portrait
// sessions only; no birthday or engagement parties (section 2).
export const ENQUIRY_TYPES = ['WEDDING', 'MICRO', 'PORTRAIT'] as const

// Server side validation for a new enquiry (SEC-A02). BR-E01 makes primaryName, email,
// enquiryType and eventDate required. Every message is written from the couple's side of the
// screen so the reason to fix a field is clear.
export const enquiryInputSchema = z.object({
  primaryName: z.string().trim().min(1, 'Enter your name.'),
  partnerName: z.string().trim().optional(),
  email: z.string().trim().toLowerCase().email('Enter a valid email so the studio can reply.'),
  phone: z.string().trim().optional(),
  enquiryType: z.enum(ENQUIRY_TYPES, {
    errorMap: () => ({ message: 'Choose what the enquiry is for.' }),
  }),
  eventDate: z.coerce.date({
    errorMap: () => ({ message: 'Choose your event date.' }),
  }),
  venueName: z.string().trim().optional(),
  venueSuburb: z.string().trim().optional(),
  guestCount: z.coerce.number().int().positive().max(100000).optional(),
  message: z.string().trim().max(4000).optional(),
  packageCodes: z.array(z.string()).optional(),
  source: z.string().trim().optional(),
  marketingConsent: z.boolean().default(false),
})

export type EnquiryInput = z.infer<typeof enquiryInputSchema>
