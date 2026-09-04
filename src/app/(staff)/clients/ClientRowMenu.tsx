'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import { archiveClientAction, deleteClientAction, restoreClientAction } from './actions'

const MENU_H = 172

/** Per-row actions menu (Studio-Ninja style). Uses fixed positioning so the dropdown is never clipped
 * by the table's scroll container, and flips upward when the row is near the bottom of the viewport. */
export function ClientRowMenu({
  clientId,
  name,
  email,
  csrf,
  archived,
  canDelete,
  backParam = '',
}: {
  clientId: string
  name: string
  email: string
  csrf: string
  archived: boolean
  canDelete: boolean
  /** Current list query string as ?back=... so the profile can return to this filtered list. */
  backParam?: string
}) {
  const btnRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

  function toggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      const menuWidth = 176
      const flipUp = r.bottom + MENU_H > window.innerHeight
      setPos({
        top: flipUp ? Math.max(8, r.top - MENU_H - 4) : r.bottom + 4,
        left: Math.max(8, r.right - menuWidth),
      })
    }
    setOpen((o) => !o)
  }

  const itemClass = 'block w-full px-4 py-2 text-left text-sm text-ink hover:bg-paper'

  return (
    <div className="flex justify-end">
      <button
        ref={btnRef}
        type="button"
        aria-label="Client actions"
        aria-haspopup="menu"
        onClick={toggle}
        className="rounded border border-transparent px-2 py-1 text-lg leading-none text-ink-muted hover:border-line-strong hover:text-ink"
      >
        ⋮
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            role="menu"
            style={{ position: 'fixed', top: pos.top, left: pos.left }}
            className="z-50 w-44 overflow-hidden rounded-md border border-line bg-surface py-1 shadow-lg"
          >
            <Link href={`/clients/${clientId}${backParam}`} role="menuitem" className={itemClass}>
              Open profile
            </Link>
            <Link href={`/clients/${clientId}/edit`} role="menuitem" className={itemClass}>
              Edit details
            </Link>
            <a href={`mailto:${email}`} role="menuitem" className={itemClass}>
              Send email
            </a>

            {archived ? (
              <form action={restoreClientAction}>
                <input type="hidden" name="csrf" value={csrf} />
                <input type="hidden" name="clientId" value={clientId} />
                <button type="submit" role="menuitem" className={itemClass}>
                  Restore client
                </button>
              </form>
            ) : (
              <form action={archiveClientAction}>
                <input type="hidden" name="csrf" value={csrf} />
                <input type="hidden" name="clientId" value={clientId} />
                <button type="submit" role="menuitem" className={itemClass}>
                  Archive client
                </button>
              </form>
            )}
            {canDelete ? (
              <form
                action={deleteClientAction}
                onSubmit={(e) => {
                  if (!window.confirm(`Permanently delete ${name} and ALL their jobs, quotes, invoices and history? This cannot be undone.`)) e.preventDefault()
                }}
              >
                <input type="hidden" name="csrf" value={csrf} />
                <input type="hidden" name="clientId" value={clientId} />
                <button type="submit" role="menuitem" className="block w-full px-4 py-2 text-left text-sm text-lost-ink hover:bg-paper">
                  Delete permanently
                </button>
              </form>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  )
}
