import { z } from 'zod'

export const createGallerySchema = z.object({
  title: z.string().trim().min(1, 'Give the gallery a title.').max(200),
})

const safeUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => /^https?:\/\//i.test(v), 'Enter a link starting with http:// or https://.')

export const addGalleryItemSchema = z.object({
  caption: z.string().trim().min(1, 'Add a caption.').max(200),
  url: safeUrl,
})

export type CreateGalleryInput = z.infer<typeof createGallerySchema>
export type AddGalleryItemInput = z.infer<typeof addGalleryItemSchema>
