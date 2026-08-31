'use client'

import { useEffect, useState } from 'react'

export function CopyLinkField({ path }: { path: string }) {
  const [url, setUrl] = useState(path)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setUrl(window.location.origin + path)
  }, [path])

  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.origin + path)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard blocked - the field stays selectable as a fallback.
    }
  }

  return (
    <div className="mt-1 flex items-center gap-2">
      <input
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        aria-label="Client link"
        className="h-8 min-w-0 flex-1 rounded border border-line-strong bg-paper px-2 text-sm text-ink"
      />
      <button
        type="button"
        onClick={copy}
        className="h-8 shrink-0 rounded border border-line-strong px-3 text-sm font-bold text-ink-muted hover:text-ink"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}
