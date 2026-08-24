'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { StatusTag } from '@/components/ui/StatusTag'
import { LIFECYCLE_OPTIONS, statusKind, statusLabel } from '../lifecycle'
import { setProjectStatusAction } from '../status-actions'

type Coords = { left: number; width: number; top?: number; bottom?: number; maxHeight: number }

const MENU_MAX = 360
const MENU_MIN_WIDTH = 188

/**
 * Inline status picker for the Projects board (Monday's Stage cell). The trigger fills the cell with
 * the current status as a bold pill; clicking opens a card of every stage, and picking one submits
 * the server action to move the project. Read-only roles get a plain pill, no menu.
 */
export function StatusPicker({
  projectId,
  current,
  csrf,
  canEdit,
}: {
  projectId: string
  current: string
  csrf: string
  canEdit: boolean
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
    const openUp = spaceBelow < 260 && spaceAbove > spaceBelow
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
    const close = () => setOpen(false)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (menuRef.current?.contains(t) || triggerRef.current?.contains(t)) return
      setOpen(false)
    }
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
    }
  }, [open])

  if (!canEdit) {
    return (
      <StatusTag kind={statusKind(current)} solid block>
        {statusLabel(current)}
      </StatusTag>
    )
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="group/status relative flex w-full cursor-pointer items-center"
        title="Change status"
      >
        <StatusTag kind={statusKind(current)} solid block>
          {statusLabel(current)}
        </StatusTag>
        <span className="pointer-events-none absolute right-2 text-xs text-white opacity-70 transition-opacity group-hover/status:opacity-100">
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
          className="z-50 flex flex-col gap-1 overflow-y-auto rounded-lg border border-line bg-surface p-1.5 shadow-xl"
        >
          {LIFECYCLE_OPTIONS.map((opt) => {
            const selected = opt.value === current
            return (
              <form key={opt.value} action={setProjectStatusAction} onSubmit={() => setOpen(false)}>
                <input type="hidden" name="csrf" value={csrf} />
                <input type="hidden" name="projectId" value={projectId} />
                <button
                  type="submit"
                  name="status"
                  value={opt.value}
                  role="option"
                  aria-selected={selected}
                  className="relative block w-full overflow-hidden rounded-md ring-accent transition-transform hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 aria-selected:ring-2 aria-selected:ring-ink"
                >
                  <StatusTag kind={opt.kind} solid block>
                    {opt.label}
                  </StatusTag>
                  {selected ? (
                    <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-white">
                      ✓
                    </span>
                  ) : null}
                </button>
              </form>
            )
          })}
        </div>
      ) : null}
    </>
  )
}
