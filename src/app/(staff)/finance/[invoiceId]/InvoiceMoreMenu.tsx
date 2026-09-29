'use client'

import { useEffect, useRef, useState } from 'react'
import { deleteInvoiceAction, issueInvoiceAction, voidInvoiceAction } from '../../jobs/actions'

type Props = {
  csrf: string
  invoiceId: string
  projectId: string
  isDraft: boolean
  canVoid: boolean
  canDelete: boolean
  /** Opens the send dialog from the menu (once sending is no longer the page's primary action). */
  onSend?: () => void
  sendLabel?: string
}

const ITEM = 'block w-full px-3 py-2 text-left text-sm text-ink hover:bg-paper'

/** Secondary/destructive invoice actions, tucked behind a "..." button so they don't compete. */
export function InvoiceMoreMenu({ csrf, invoiceId, projectId, isDraft, canVoid, canDelete, onSend, sendLabel = 'Send invoice' }: Props) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const hidden: Record<string, string> = { csrf, invoiceId, projectId }

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More actions"
        className="flex h-9 w-9 items-center justify-center rounded-md border border-line-strong bg-surface text-ink-muted transition-colors hover:bg-sunk hover:text-ink"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true"><circle cx="4" cy="10" r="1.6" /><circle cx="10" cy="10" r="1.6" /><circle cx="16" cy="10" r="1.6" /></svg>
      </button>

      {open ? (
        <div role="menu" className="absolute right-0 top-full z-10 mt-1 w-56 overflow-hidden rounded-md border border-line bg-surface py-1 shadow-lg">
          {onSend ? (
            <button type="button" role="menuitem" onClick={() => { setOpen(false); onSend() }} className={ITEM}>{sendLabel}</button>
          ) : null}
          {isDraft ? (
            // Issue without emailing (e.g. the client was sent the link another way).
            <form action={issueInvoiceAction}>
              {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
              <button type="submit" role="menuitem" className={ITEM}>Issue without sending</button>
            </form>
          ) : null}
          {canVoid ? (
            <form action={voidInvoiceAction} onSubmit={(e) => { if (!window.confirm('Void this invoice? It stays on record but is marked void.')) e.preventDefault() }}>
              {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
              <button type="submit" role="menuitem" className={ITEM}>Void invoice</button>
            </form>
          ) : null}
          {canDelete ? (
            <form action={deleteInvoiceAction} onSubmit={(e) => { if (!window.confirm('Delete this invoice permanently? This cannot be undone.')) e.preventDefault() }}>
              {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
              <input type="hidden" name="back" value="/finance" />
              <button type="submit" role="menuitem" className="block w-full px-3 py-2 text-left text-sm text-danger hover:bg-paper">Delete invoice</button>
            </form>
          ) : null}
          {!onSend && !isDraft && !canVoid && !canDelete ? (
            <p className="px-3 py-2 text-sm text-ink-muted">No further actions.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
