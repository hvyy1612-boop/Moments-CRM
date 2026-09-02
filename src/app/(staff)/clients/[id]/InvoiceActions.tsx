'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { deleteInvoiceAction } from '../../jobs/actions'

type Props = {
  csrf: string
  invoiceId: string
  projectId: string
  clientId: string
  viewHref: string
  manageHref: string
  portalPath: string | null
  canDelete: boolean
}

function IconDots() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden>
      <circle cx="4" cy="10" r="1.6" />
      <circle cx="10" cy="10" r="1.6" />
      <circle cx="16" cy="10" r="1.6" />
    </svg>
  )
}

/** Per-invoice actions on the client page: View + an SN-style "..." menu (Manage, portal, Delete). */
export function InvoiceActions({ csrf, invoiceId, projectId, clientId, viewHref, manageHref, portalPath, canDelete }: Props) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div className="flex items-center gap-3">
      <Link href={viewHref} target="_blank" className="text-sm font-bold text-accent hover:underline">
        View
      </Link>

      <div ref={wrap} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="More actions"
          className="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-paper hover:text-ink"
        >
          <IconDots />
        </button>

        {open ? (
          <div
            role="menu"
            className="absolute right-0 top-full z-10 mt-1 w-52 overflow-hidden rounded-md border border-line bg-surface py-1 shadow-lg"
          >
            <Link
              href={manageHref}
              className="block px-3 py-2 text-sm text-ink hover:bg-paper"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              Edit / manage
            </Link>
            {portalPath ? (
              <Link
                href={portalPath}
                target="_blank"
                className="block px-3 py-2 text-sm text-ink hover:bg-paper"
                role="menuitem"
                onClick={() => setOpen(false)}
              >
                Open in client portal
              </Link>
            ) : null}
            {canDelete ? (
              <form action={deleteInvoiceAction}>
                <input type="hidden" name="csrf" value={csrf} />
                <input type="hidden" name="invoiceId" value={invoiceId} />
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="clientId" value={clientId} />
                <button
                  type="submit"
                  role="menuitem"
                  onClick={(e) => {
                    if (!confirm('Delete this invoice? This cannot be undone.')) e.preventDefault()
                  }}
                  className="block w-full px-3 py-2 text-left text-sm text-danger hover:bg-paper"
                >
                  Delete
                </button>
              </form>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
