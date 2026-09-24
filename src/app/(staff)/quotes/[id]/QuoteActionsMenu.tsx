'use client'

import { useState } from 'react'
import { duplicateQuoteAction, reviseQuoteAction } from '../actions'

/**
 * Overflow (•••) menu for the Quote detail page: holds the secondary/utility actions (duplicate, create
 * revision, copy client link) so the primary action bar stays about the quote itself. Uses a native
 * <details> disclosure — no click-outside wiring — styled as a dropdown in the Moments system.
 */
export function QuoteActionsMenu({
  quoteId,
  csrf,
  clientLinkPath,
  showCopyLink,
  showRevise,
}: {
  quoteId: string
  csrf: string
  clientLinkPath: string
  showCopyLink: boolean
  showRevise: boolean
}) {
  const [copied, setCopied] = useState(false)

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${clientLinkPath}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard blocked — ignore */
    }
  }

  const itemClass = 'flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-paper'

  return (
    <details className="relative">
      <summary className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-md border border-line text-ink transition-colors hover:bg-paper [&::-webkit-details-marker]:hidden" aria-label="More actions">
        <span aria-hidden className="text-lg leading-none">⋯</span>
      </summary>
      <div className="absolute right-0 z-10 mt-1 w-52 overflow-hidden rounded-md border border-line bg-surface py-1 shadow-sm">
        {showCopyLink ? (
          <button type="button" onClick={copyLink} className={itemClass}>
            {copied ? 'Link copied' : 'Copy client link'}
          </button>
        ) : null}
        {showRevise ? (
          <form action={reviseQuoteAction}>
            <input type="hidden" name="csrf" value={csrf} />
            <input type="hidden" name="quoteId" value={quoteId} />
            <button type="submit" className={itemClass}>Create revision</button>
          </form>
        ) : null}
        <form action={duplicateQuoteAction}>
          <input type="hidden" name="csrf" value={csrf} />
          <input type="hidden" name="quoteId" value={quoteId} />
          <button type="submit" className={itemClass}>Duplicate quote</button>
        </form>
      </div>
    </details>
  )
}
