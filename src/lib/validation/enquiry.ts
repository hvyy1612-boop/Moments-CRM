import { z } from 'zod'

export const ENQUIRY_TYPES = ['WEDDING', 'MICRO', 'PORTRAIT'] as const

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
