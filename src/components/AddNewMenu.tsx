'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

export function AddNewMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  const item = 'block w-full px-4 py-2 text-left text-sm text-ink hover:bg-paper'

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        className="inline-flex items-center gap-1.5 rounded bg-ink px-3 py-1.5 text-sm font-medium text-surface hover:opacity-90"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        Add new
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 top-10 z-40 w-48 overflow-hidden rounded-md border border-line bg-surface py-1 shadow-lg">
          <Link href="/clients/new" role="menuitem" className={item} onClick={() => setOpen(false)}>New client</Link>
          <Link href="/enquiries" role="menuitem" className={item} onClick={() => setOpen(false)}>Enquiries</Link>
          <Link href="/calendar" role="menuitem" className={item} onClick={() => setOpen(false)}>Calendar event</Link>
        </div>
      ) : null}
    </div>
  )
}
