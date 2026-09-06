'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'

/**
 * Small anchored popover used across the Enquiries list (stage control, progress checklist, row menu,
 * toolbar dropdowns). Fixed positioning + getBoundingClientRect so the panel is never clipped by the
 * table's horizontal scroll container. Closes on outside click, Escape, scroll, or resize. Purely a
 * presentation primitive - it holds no business state.
 */
export function Popover({
  renderTrigger,
  children,
  width = 200,
  align = 'left',
  maxHeight = 360,
}: {
  renderTrigger: (p: { ref: RefObject<HTMLButtonElement | null>; onClick: () => void; open: boolean }) => ReactNode
  children: (p: { close: () => void }) => ReactNode
  width?: number
  align?: 'left' | 'right'
  maxHeight?: number
}) {
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number } | null>(null)

  const place = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const spaceBelow = window.innerHeight - r.bottom
    const openUp = spaceBelow < Math.min(maxHeight, 260) && r.top > spaceBelow
    const rawLeft = align === 'right' ? r.right - width : r.left
    const left = Math.min(Math.max(8, rawLeft), Math.max(8, window.innerWidth - width - 8))
    setPos(openUp ? { bottom: window.innerHeight - r.top + 6, left } : { top: r.bottom + 6, left })
  }, [align, width, maxHeight])

  const toggle = useCallback(() => {
    if (!open) place()
    setOpen((v) => !v)
  }, [open, place])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (panelRef.current?.contains(t) || triggerRef.current?.contains(t)) return
      setOpen(false)
    }
    const onScroll = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    const onResize = () => setOpen(false)
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  return (
    <>
      {renderTrigger({ ref: triggerRef, onClick: toggle, open })}
      {open && pos ? (
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left, width, maxHeight }}
          className="z-50 overflow-y-auto rounded-lg border border-line bg-surface p-1.5 shadow-lg"
        >
          {children({ close: () => setOpen(false) })}
        </div>
      ) : null}
    </>
  )
}
