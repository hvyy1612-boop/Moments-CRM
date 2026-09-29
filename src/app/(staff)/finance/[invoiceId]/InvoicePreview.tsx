'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

const STEPS = [0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5]
const icon = { viewBox: '0 0 24 24', className: 'h-4 w-4', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
const TOOL_BTN = 'flex h-8 w-8 items-center justify-center rounded text-ink-muted transition-colors hover:bg-sunk hover:text-ink disabled:cursor-not-allowed disabled:opacity-40'

/**
 * The invoice as the client receives it, centred on a quiet canvas. Toolbar: zoom out / in (the sheet is
 * scaled, never re-laid-out, so it stays true to the PDF) and full screen. There is no page stepper: the
 * printed invoice is always fitted to one A4 page (InvoiceFit), so a "1 / 2" control would be fake.
 * Narrow screens start zoomed to fit instead of scrolling sideways.
 */
export function InvoicePreview({ children, title = 'Invoice preview' }: { children: ReactNode; title?: string }) {
  const section = useRef<HTMLElement>(null)
  const canvas = useRef<HTMLDivElement>(null)
  const sheet = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const [full, setFull] = useState(false)
  const [canFull, setCanFull] = useState(false)

  useEffect(() => {
    const el = sheet.current
    if (!el) return
    const measure = () => setSize({ w: el.offsetWidth, h: el.offsetHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    // Fit a phone/tablet width once, so the page never scrolls sideways at first sight.
    const avail = (canvas.current?.clientWidth ?? 0) - 32
    if (avail > 0 && el.offsetWidth > avail) setZoom(Math.max(0.3, Math.floor((avail / el.offsetWidth) * 100) / 100))
    setCanFull(Boolean(document.fullscreenEnabled))
    const onFull = () => setFull(document.fullscreenElement === section.current)
    document.addEventListener('fullscreenchange', onFull)
    return () => {
      ro.disconnect()
      document.removeEventListener('fullscreenchange', onFull)
    }
  }, [])

  const zoomOut = () => setZoom((z) => [...STEPS].reverse().find((s) => s < z - 0.001) ?? z)
  const zoomIn = () => setZoom((z) => STEPS.find((s) => s > z + 0.001) ?? z)
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void section.current?.requestFullscreen()
  }

  return (
    <section ref={section} className={`rounded-md border border-line bg-surface ${full ? 'flex flex-col overflow-hidden' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
          <svg {...icon} className="h-5 w-5 text-ink-muted"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></svg>
          {title}
        </h2>
        <div className="flex items-center gap-1" role="toolbar" aria-label="Preview controls">
          <button type="button" onClick={zoomOut} disabled={zoom <= STEPS[0]! + 0.001} aria-label="Zoom out" className={TOOL_BTN}>
            <svg {...icon}><circle cx="12" cy="12" r="9" /><path d="M8 12h8" /></svg>
          </button>
          <span className="tabular w-12 text-center text-sm text-ink" aria-live="polite">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={zoomIn} disabled={zoom >= STEPS[STEPS.length - 1]! - 0.001} aria-label="Zoom in" className={TOOL_BTN}>
            <svg {...icon}><circle cx="12" cy="12" r="9" /><path d="M8 12h8M12 8v8" /></svg>
          </button>
          {canFull ? (
            <>
              <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />
              <button type="button" onClick={toggleFull} aria-label={full ? 'Exit full screen' : 'Full screen'} className={TOOL_BTN}>
                {full
                  ? <svg {...icon}><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /></svg>
                  : <svg {...icon}><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>}
              </button>
            </>
          ) : null}
        </div>
      </div>
      <div ref={canvas} className={`overflow-auto bg-sunk px-4 py-8 sm:px-8 sm:py-10 ${full ? 'min-h-0 flex-1' : ''}`}>
        {/* The scaled box reserves the zoomed size so the canvas scrolls exactly as far as the sheet reaches. */}
        <div className="mx-auto" style={size ? { width: size.w * zoom, height: size.h * zoom } : undefined}>
          <div ref={sheet} className="w-[210mm]" style={size ? { transform: `scale(${zoom})`, transformOrigin: 'top left' } : undefined}>
            {children}
          </div>
        </div>
      </div>
    </section>
  )
}
