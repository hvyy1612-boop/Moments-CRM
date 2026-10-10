'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Button, buttonClass } from '@/components/ui/Button'
import { recoveryCodesFileText } from '@/lib/auth/recovery-code-format'

const SVG = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

export function RecoveryCodesPanel({
  loginId,
  codes,
  createdLabel,
  continueHref,
  continueLabel = 'Continue',
  showLoginId = false,
}: {
  loginId: string
  codes: string[]
  createdLabel: string
  continueHref: string
  continueLabel?: string

  showLoginId?: boolean
}) {
  const [copied, setCopied] = useState<'id' | 'codes' | null>(null)
  const [shown, setShown] = useState(false)
  const [understood, setUnderstood] = useState(false)
  const fileText = recoveryCodesFileText(loginId, codes, createdLabel)
  const fileName = `moments-recovery-codes-${loginId.split('@')[0]}.txt`
  const fileSize = `${(new TextEncoder().encode(fileText).length / 1024).toFixed(2)} KB`

  const copy = async (text: string, what: 'id' | 'codes') => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(what)
      setTimeout(() => setCopied(null), 2500)
    } catch {
      setCopied(null)
    }
  }

  const download = () => {
    const url = URL.createObjectURL(new Blob([fileText], { type: 'text/plain;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col gap-5">
      {showLoginId ? (
        <div>
          <p className="text-sm font-medium text-ink">Your login ID</p>
          <div className="mt-1 flex items-center justify-between gap-3 rounded-md border border-line bg-paper px-3 py-2">
            <span className="min-w-0 font-mono text-base text-ink">
              {loginId.split('@')[0]}@<wbr />
              {loginId.split('@')[1]}
            </span>
            <button type="button" onClick={() => copy(loginId, 'id')} className="shrink-0 text-sm font-bold text-accent-ink hover:underline">
              {copied === 'id' ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      ) : null}

      <p className="text-base text-ink">
        Your <strong>recovery codes</strong> let you set a new password if you forget it. Each code works once.
      </p>

      {/* Download box (the ProtonMail pattern): file preview, name + size, round download button. */}
      <div className="flex items-center gap-4 rounded-xl border border-line-strong p-4">
        <svg viewBox="0 0 40 48" className="h-14 w-12 shrink-0 text-ink-muted" aria-hidden="true">
          <rect x="1" y="1" width="38" height="46" rx="4" fill="var(--color-paper)" stroke="currentColor" strokeWidth="1.5" />
          {[10, 15, 20, 25].map((y) => (
            <rect key={y} x="7" y={y} width={y === 25 ? 16 : 26} height="2" rx="1" fill="currentColor" opacity="0.55" />
          ))}
          <rect x="7" y="33" width="26" height="6" rx="2" fill="var(--color-accent)" opacity="0.35" />
        </svg>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-ink">Download codes</p>
          <p className="break-all text-sm text-ink-muted">
            {fileName}
          </p>
          <p className="text-sm text-ink-muted">{fileSize}</p>
        </div>
        <button
          type="button"
          onClick={download}
          aria-label={`Download ${fileName}`}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-ink text-surface transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <svg viewBox="0 0 24 24" {...SVG} className="h-5 w-5" aria-hidden="true">
            <path d="M12 4v11m0 0-4-4m4 4 4-4M6 20h12" />
          </svg>
        </button>
      </div>

      <p className="-mt-2 text-sm text-ink">
        Or{' '}
        <button type="button" onClick={() => copy(fileText, 'codes')} className="font-medium text-accent-ink underline underline-offset-2">
          {copied === 'codes' ? 'copied' : 'copy the codes'}
        </button>{' '}
        as text ·{' '}
        <button type="button" onClick={() => setShown((v) => !v)} aria-expanded={shown} className="font-medium text-accent-ink underline underline-offset-2">
          {shown ? 'hide codes' : 'show codes'}
        </button>
      </p>

      {shown ? (
        <ol className="-mt-2 grid grid-cols-2 gap-2 rounded-md border border-line bg-paper p-3" aria-label="Recovery codes">
          {codes.map((code) => (
            <li key={code} className="tabular rounded bg-surface px-2 py-1.5 text-center font-mono text-sm tracking-wider text-ink">
              {code}
            </li>
          ))}
        </ol>
      ) : null}

      <label className="flex cursor-pointer items-start gap-3 text-base text-ink">
        <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-ink" />
        <span>I have saved my recovery codes somewhere safe and will not share them with anyone.</span>
      </label>

      {understood ? (
        <Link href={continueHref} className={`${buttonClass('primary', 'lg')} w-full`}>
          {continueLabel}
        </Link>
      ) : (
        <Button type="button" size="lg" disabled className="w-full">
          {continueLabel}
        </Button>
      )}
    </div>
  )
}
