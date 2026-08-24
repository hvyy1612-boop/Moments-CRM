'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { StatusTag } from '@/components/ui/StatusTag'
import { LIFECYCLE_OPTIONS, statusKind, statusLabel } from '../lifecycle'
import { setProjectStatusAction } from '../status-actions'

type Coords = { left: number; width: number; top?: number; bottom?: number; maxHeight: number }

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
    const openUp = spaceBelow < 240 && spaceAbove > spaceBelow
    setCoords({
      left: rect.left,
      width: rect.width,
      ...(openUp
        ? { bottom: window.innerHeight - rect.top + 4, maxHeight: spaceAbove - 12 }
        : { top: rect.bottom + 4, maxHeight: spaceBelow - 12 }),
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
      <StatusTag kind={statusKind(current)} block>
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
        <StatusTag kind={statusKind(current)} block>
          {statusLabel(current)}
        </StatusTag>
        <span className="pointer-events-none absolute right-2 text-xs opacity-50 transition-opacity group-hover/status:opacity-90">
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
            minWidth: coords.width,
            maxHeight: coords.maxHeight,
          }}
          className="z-50 overflow-y-auto rounded-md border border-line bg-surface p-1 shadow-lg"
        >
          {LIFECYCLE_OPTIONS.map((opt) => (
            <form key={opt.value} action={setProjectStatusAction} onSubmit={() => setOpen(false)}>
              <input type="hidden" name="csrf" value={csrf} />
              <input type="hidden" name="projectId" value={projectId} />
              <button
                type="submit"
                name="status"
                value={opt.value}
                role="option"
                aria-selected={opt.value === current}
                className="mb-1 flex w-full items-center gap-2 last:mb-0"
              >
                <span className="w-4 shrink-0 text-center text-xs text-ink-muted">
                  {opt.value === current ? '✓' : ''}
                </span>
                <span className="flex-1 overflow-hidden rounded">
                  <StatusTag kind={opt.kind} block>
                    {opt.label}
                  </StatusTag>
                </span>
              </button>
            </form>
          ))}
        </div>
      ) : null}
    </>
  )
}
