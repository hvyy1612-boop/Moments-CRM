'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { StatusTag } from '@/components/ui/StatusTag'
import { ENQUIRY_KIND, ENQUIRY_LABEL, OUTCOME_OPTIONS, STAGE_OPTIONS } from '../status'
import { setEnquiryStatusAction } from '@/app/(staff)/enquiries/actions'

type Coords = { left: number; width: number; top?: number; bottom?: number; maxHeight: number }

const MENU_MAX = 340
const MENU_MIN_WIDTH = 220

export function EnquiryStatusPicker({
  enquiryId,
  current,
  csrf,
}: {
  enquiryId: string
  current: string
  csrf: string
}) {
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<Coords | null>(null)

  const place = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const spaceAbove = rect.top
    const openUp = spaceBelow < 240 && spaceAbove > spaceBelow
    setCoords({
      left: rect.left,
      width: rect.width,
      ...(openUp
        ? { bottom: window.innerHeight - rect.top + 6, maxHeight: Math.min(spaceAbove - 16, MENU_MAX) }
        : { top: rect.bottom + 6, maxHeight: Math.min(spaceBelow - 16, MENU_MAX) }),
    })
  }, [])

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
      if (menuRef.current?.contains(t) || triggerRef.current?.contains(t)) return
      setOpen(false)
    }
    const onScroll = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    const onResize = () => setOpen(false)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
    }
  }, [open])

  const option = (value: string, label: string, kind: Parameters<typeof StatusTag>[0]['kind']) => (
    <form
      key={value}
      action={setEnquiryStatusAction}
      onSubmit={() => setOpen(false)}
    >
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="enquiryId" value={enquiryId} />
      <button
        type="submit"
        name="status"
        value={value}
        role="option"
        aria-selected={value === current}
        className="relative block w-full overflow-hidden rounded-md transition-transform hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent aria-selected:ring-2 aria-selected:ring-ink"
      >
        <StatusTag kind={kind} solid block>
          {label}
        </StatusTag>
        {value === current ? (
          <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-white">
            ✓
          </span>
        ) : null}
      </button>
    </form>
  )

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="group/st relative flex w-full cursor-pointer items-center"
        title="Change status"
      >
        <StatusTag kind={ENQUIRY_KIND[current] ?? 'hold'} solid block>
          {ENQUIRY_LABEL[current] ?? current}
        </StatusTag>
        <span className="pointer-events-none absolute right-2 text-xs text-white opacity-70 transition-opacity group-hover/st:opacity-100">
          ▾
        </span>
      </button>

      {open && coords ? (
        <div
          ref={menuRef}
          role="listbox"
          style={{
            position: 'fixed',
            left: coords.left,
            top: coords.top,
            bottom: coords.bottom,
            minWidth: Math.max(coords.width, MENU_MIN_WIDTH),
            maxHeight: coords.maxHeight,
          }}
          className="z-40 flex flex-col gap-2 overflow-y-auto rounded-lg border border-line bg-surface p-2.5 shadow-xl"
        >
          <div className="px-1 text-xs font-bold uppercase tracking-wide text-muted">Stage</div>
          {STAGE_OPTIONS.map((o) => option(o.value, o.label, o.kind))}
          <div className="mt-1 border-t border-line px-1 pt-2 text-xs font-bold uppercase tracking-wide text-muted">
            Outcome
          </div>
          {OUTCOME_OPTIONS.map((o) => option(o.value, o.label, o.kind))}
        </div>
      ) : null}
    </>
  )
}
