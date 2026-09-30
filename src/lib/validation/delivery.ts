import { z } from 'zod'

export const createGallerySchema = z.object({
  title: z.string().trim().min(1, 'Please give the gallery a title.').max(200),
})

const safeUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => /^https?:\/\//i.test(v), 'Please enter a link starting with http:// or https://.')

export const addGalleryItemSchema = z.object({
  caption: z.string().trim().min(1, 'Please add a caption.').max(200),
  url: safeUrl,
})

export type CreateGalleryInput = z.infer<typeof createGallerySchema>
export type AddGalleryItemInput = z.infer<typeof addGalleryItemSchema>
