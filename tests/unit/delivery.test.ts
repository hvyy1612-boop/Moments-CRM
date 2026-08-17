import { describe, expect, it } from 'vitest'
import { addGalleryItemSchema } from '@/lib/validation/delivery'

const parse = (url: string) => addGalleryItemSchema.safeParse({ caption: 'A photo', url })

describe('gallery item link safety', () => {
  it('accepts http and https links', () => {
    expect(parse('https://example.com/album').success).toBe(true)
    expect(parse('http://example.com/a.jpg').success).toBe(true)
  })

  it('rejects any other scheme, since the link is only ever rendered as an href', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,x', 'ftp://x', '/relative', 'mailto:a@b.c']) {
      expect(parse(url).success).toBe(false)
    }
  })

  it('requires a caption', () => {
    expect(addGalleryItemSchema.safeParse({ caption: '', url: 'https://example.com' }).success).toBe(
      false,
    )
  })
})
