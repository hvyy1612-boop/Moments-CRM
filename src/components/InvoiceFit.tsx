'use client'

import { useEffect } from 'react'

// A4 printable height with the document's 10mm @page margins = 277mm, in CSS px at 96dpi.
const PAGE_PX = (277 / 25.4) * 96
// On screen the invoice carries 12mm top+bottom padding that the print copy drops (print:p-0); remove it
// so the measured height matches what actually prints. The slightly narrower on-screen width errs safe
// (measures a touch tall -> scales a touch small -> always fits).
const PAD_PX = (24 / 25.4) * 96

/**
 * Keeps the printed Tax Invoice on a single A4 page. Measures the rendered invoice and, when it would
 * overrun the sheet, publishes a <1 zoom factor as --inv-scale that InvoiceDocument's print CSS applies
 * (zoom shrinks the layout box, so pagination sees one page). A short invoice stays at 1 and simply
 * fills the page. Re-measures on mount, on resize, and right before printing. Renders nothing.
 */
export function InvoiceFit() {
  useEffect(() => {
    const measure = () => {
      const doc = document.querySelector<HTMLElement>('.inv-doc')
      if (!doc) return
      const contentPx = Math.max(1, doc.scrollHeight - PAD_PX)
      const scale = contentPx > PAGE_PX ? Math.max(0.5, PAGE_PX / contentPx) : 1
      // round DOWN so we never nudge back over the page edge
      document.documentElement.style.setProperty('--inv-scale', String(Math.floor(scale * 1000) / 1000))
    }
    measure()
    const settle = setTimeout(measure, 200) // after fonts/layout settle
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
