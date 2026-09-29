import { z } from 'zod'

/** Client signs a contract by typing their full name (same lightweight ceremony as quote accept). */
export const signContractSchema = z.object({
  signedName: z.string().trim().min(1, 'Please type your full name to sign.').max(120),
})

export type SignContractInput = z.infer<typeof signContractSchema>
