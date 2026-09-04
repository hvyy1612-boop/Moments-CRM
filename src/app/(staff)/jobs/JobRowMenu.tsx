'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'

const MENU_H = 96

export function JobRowMenu({ jobId, clientId, backParam = '' }: { jobId: string; clientId: string; backParam?: string }) {
  const btnRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

  function toggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      const width = 160
      const flipUp = r.bottom + MENU_H > window.innerHeight
      setPos({ top: flipUp ? Math.max(8, r.top - MENU_H - 4) : r.bottom + 4, left: Math.max(8, r.right - width) })
    }
    setOpen((o) => !o)
  }

  const itemClass = 'block w-full px-4 py-2 text-left text-sm text-ink hover:bg-paper'

  return (
    <div className="flex justify-end">
      <button
        ref={btnRef}
        type="button"
        aria-label="Job actions"
        aria-haspopup="menu"
        onClick={toggle}
        className="rounded border border-transparent px-2 py-1 text-lg leading-none text-ink-muted hover:border-line-strong hover:text-ink"
      >
        ⋮
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div role="menu" style={{ position: 'fixed', top: pos.top, left: pos.left }} className="z-50 w-40 overflow-hidden rounded-md border border-line bg-surface py-1 shadow-lg">
            <Link href={`/jobs/${jobId}${backParam}`} role="menuitem" className={itemClass}>Open job</Link>
            <Link href={`/clients/${clientId}`} role="menuitem" className={itemClass}>View client</Link>
          </div>
        </>
      ) : null}
    </div>
  )
}
