'use client'

import { useEffect } from 'react'

const PAGE_PX = (277 / 25.4) * 96

const PAD_PX = (24 / 25.4) * 96

export function InvoiceFit() {
  useEffect(() => {
    const measure = () => {
      const doc = document.querySelector<HTMLElement>('.inv-doc')
      if (!doc) return
      const contentPx = Math.max(1, doc.scrollHeight - PAD_PX)
      const scale = contentPx > PAGE_PX ? Math.max(0.5, PAGE_PX / contentPx) : 1

      document.documentElement.style.setProperty('--inv-scale', String(Math.floor(scale * 1000) / 1000))
    }
    measure()
    const settle = setTimeout(measure, 200)
    window.addEventListener('beforeprint', measure)
    window.addEventListener('resize', measure)
    return () => {
      clearTimeout(settle)
      window.removeEventListener('beforeprint', measure)
      window.removeEventListener('resize', measure)
    }
  }, [])
  return null
}
