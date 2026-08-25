'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { updateEnquiryAction } from '@/app/(staff)/enquiries/actions'

type Coords = { left: number; top?: number; bottom?: number }

type Item = { op: string; label: string; danger?: boolean }

/**
 * Context actions for one enquiry, driven by the backend state (status + waitingOn). The list only
 * offers what makes sense: flip who owes the reply, qualify, create the project, mark lost, or reopen
 * a closed lead. Converted leads link straight to the project.
 */
export function EnquiryActions({
  enquiryId,
  status,
  waitingOn,
  projectId,
  csrf,
}: {
  enquiryId: string
  status: string
  waitingOn: string | null
  projectId: string | null
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
    const openUp = spaceBelow < 220
    // Right-align the menu to the trigger.
    setCoords({
      left: rect.right - 208,
      ...(openUp ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
    })
  }, [])

  const toggle = useCallback(() => {
    if (!open) place()
    setOpen((v) => !v)
  }, [open, place])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
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

  // Converted leads are no longer worked here — jump to the project instead.
  if (status === 'CONVERTED') {
    return projectId ? (
      <Link href={`/projects/${projectId}`} className="font-bold text-accent-ink hover:underline">
        Open project
      </Link>
    ) : (
      <span className="text-muted">-</span>
    )
  }

  const items: Item[] =
    status === 'LOST' || status === 'ARCHIVED'
      ? [{ op: 'reopen', label: 'Reopen lead' }]
      : [
          waitingOn === 'CLIENT'
            ? { op: 'client_replied', label: 'Client replied' }
            : { op: 'replied', label: 'Mark as replied' },
          ...(status !== 'QUALIFIED' ? [{ op: 'qualify', label: 'Mark as qualified' }] : []),
          { op: 'convert', label: 'Create project' },
          { op: 'lost', label: 'Mark as lost', danger: true },
        ]

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        className="rounded border border-line-strong px-2 py-1 text-sm font-bold text-ink-muted transition-colors hover:text-ink"
      >
        Update ▾
      </button>

      {open && coords ? (
        <div
          ref={menuRef}
          role="menu"
          style={{ position: 'fixed', left: coords.left, top: coords.top, bottom: coords.bottom, width: 208 }}
          className="z-40 flex flex-col overflow-hidden rounded-md border border-line bg-surface py-1 shadow-xl"
        >
          {items.map((item) => (
            <form key={item.op} action={updateEnquiryAction} onSubmit={() => setOpen(false)}>
              <input type="hidden" name="csrf" value={csrf} />
              <input type="hidden" name="enquiryId" value={enquiryId} />
              <input type="hidden" name="op" value={item.op} />
              <button
                type="submit"
                role="menuitem"
                className={`block w-full px-3 py-2 text-left text-base transition-colors hover:bg-paper ${
                  item.danger ? 'text-lost-ink' : 'text-ink'
                }`}
              >
                {item.label}
              </button>
            </form>
          ))}
        </div>
      ) : null}
    </>
  )
}
