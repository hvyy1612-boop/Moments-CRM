'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { StatusTag } from '@/components/ui/StatusTag'
import { isCommonLabel, type StatusLabel } from '../labels'
import { setProjectStatusAction } from '../status-actions'
import { LabelEditor } from './LabelEditor'

type Coords = { left: number; width: number; top?: number; bottom?: number; maxHeight: number }

const MENU_MAX = 420
const MENU_MIN_WIDTH = 188

/**
 * Inline status picker for the Projects board (Monday's Stage cell). The trigger fills the cell with
 * the current label as a bold pill; clicking opens the company's status set, split into the everyday
 * ones and a "More" group, with an "Edit labels" row that opens the label editor. Read-only roles
 * get a plain pill, no menu.
 */
export function StatusPicker({
  projectId,
  current,
  labels,
  csrf,
  canEdit,
}: {
  projectId: string
  current: StatusLabel
  labels: StatusLabel[]
  csrf: string
  canEdit: boolean
}) {
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<Coords | null>(null)
  const [showMore, setShowMore] = useState(false)
  const [showEditor, setShowEditor] = useState(false)

  const commonLabels = labels.filter(isCommonLabel)
  const moreLabels = labels.filter((l) => !isCommonLabel(l))
  const currentIsMore = moreLabels.some((l) => l.id === current.id)

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
    if (!open) {
      place()
      setShowMore(currentIsMore)
    }
    setOpen((v) => !v)
  }, [open, place, currentIsMore])

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

  const renderOption = (label: StatusLabel) => {
    const selected = label.id === current.id
    return (
      <form key={label.id} action={setProjectStatusAction} onSubmit={() => setOpen(false)}>
        <input type="hidden" name="csrf" value={csrf} />
        <input type="hidden" name="projectId" value={projectId} />
        <button
          type="submit"
          name="labelId"
          value={label.id}
          role="option"
          aria-selected={selected}
          className="relative block w-full overflow-hidden rounded-md transition-transform hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent aria-selected:ring-2 aria-selected:ring-ink"
        >
          <StatusTag kind={label.color} solid block>
            {label.name}
          </StatusTag>
          {selected ? (
            <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-white">
              ✓
            </span>
          ) : null}
        </button>
      </form>
    )
  }

  if (!canEdit) {
    return (
      <StatusTag kind={current.color} solid block>
        {current.name}
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
        <StatusTag kind={current.color} solid block>
          {current.name}
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
          className="z-40 flex flex-col gap-2 overflow-y-auto rounded-lg border border-line bg-surface p-2.5 shadow-xl"
        >
          {commonLabels.map(renderOption)}
          {moreLabels.length > 0 &&
            (showMore ? (
              <>
                <div className="border-t border-line" />
                {moreLabels.map(renderOption)}
                <button
                  type="button"
                  onClick={() => setShowMore(false)}
                  className="flex w-full items-center justify-center gap-1 pt-0.5 text-sm font-semibold text-ink-muted transition-colors hover:text-ink"
                >
                  Show less ▴
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setShowMore(true)}
                className="flex w-full items-center justify-center gap-1 border-t border-line pt-2.5 text-sm font-semibold text-ink-muted transition-colors hover:text-ink"
              >
                More statuses ▾
              </button>
            ))}
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              setShowEditor(true)
            }}
            className="flex w-full items-center justify-center gap-1 border-t border-line pt-2.5 text-sm font-semibold text-accent-ink hover:underline"
          >
            ✎ Edit labels
          </button>
        </div>
      ) : null}

      {showEditor ? (
        <LabelEditor labels={labels} csrf={csrf} onClose={() => setShowEditor(false)} />
      ) : null}
    </>
  )
}
