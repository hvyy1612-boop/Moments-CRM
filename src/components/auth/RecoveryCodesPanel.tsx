'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button, buttonClass } from '@/components/ui/Button'
import { recoveryCodesFileText } from '@/lib/auth/recovery-code-format'

const SVG = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

/**
 * The six recovery codes, shown ONCE right after they are created, with Download (.txt) and Copy - the
 * ProtonMail pattern, so the staff member keeps them somewhere outside the app.
 */
export function RecoveryCodesPanel({
  loginId,
  codes,
  createdLabel,
  continueHref,
  continueLabel,
}: {
  loginId: string
  codes: string[]
  createdLabel: string
  continueHref?: string
  continueLabel?: string
}) {
  const [copied, setCopied] = useState(false)
  const fileText = recoveryCodesFileText(loginId, codes, createdLabel)

  const download = () => {
    const blob = new Blob([fileText], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `moments-recovery-codes-${loginId.split('@')[0]}.txt`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(fileText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Alert tone="warning" title="Save your recovery codes now">
        If you forget your password, use your login ID and one of these codes on the &quot;Forgot password&quot; page.
        Each code works once. They will not be shown again.
      </Alert>

      <ol className="grid grid-cols-2 gap-2 rounded-md border border-line bg-paper p-4" aria-label="Recovery codes">
        {codes.map((code) => (
          <li key={code} className="tabular rounded bg-surface px-3 py-2 text-center font-mono text-base tracking-wider text-ink">
            {code}
          </li>
        ))}
      </ol>

      <div className="grid grid-cols-2 gap-3">
        <Button type="button" variant="secondary" className="w-full" onClick={download}>
          <svg viewBox="0 0 24 24" {...SVG} className="h-4 w-4" aria-hidden="true">
            <path d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14" />
          </svg>
          Download
        </Button>
        <Button type="button" variant="secondary" className="w-full" onClick={copy}>
          <svg viewBox="0 0 24 24" {...SVG} className="h-4 w-4" aria-hidden="true">
            <rect x="9" y="9" width="12" height="12" rx="2" />
            <path d="M5 15V5a2 2 0 0 1 2-2h10" />
          </svg>
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>

      {continueHref ? (
        <Link href={continueHref} className={`${buttonClass('primary')} w-full`}>
          {continueLabel ?? 'Continue'}
        </Link>
      ) : null}
    </div>
  )
}
