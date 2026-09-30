'use client'

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

const SIZE: Record<string, string> = { xs: 'max-w-sm', sm: 'max-w-lg', md: 'max-w-2xl', lg: 'max-w-4xl' }

export const modalBody = 'flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-4'

export const modalCancelBtn =
  'min-h-16 flex-1 border-r border-line px-4 text-left text-sm font-bold text-ink-muted transition-colors hover:bg-paper'
export const modalPrimaryBtn =
  'min-h-16 flex-1 bg-ink px-4 text-left text-sm font-bold text-surface transition-opacity hover:opacity-90'

export function ModalFooter({ children }: { children: React.ReactNode }) {
  return <div className="flex border-t border-line">{children}</div>
}

export function ModalField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-bold text-ink-muted">{label}</span>
      {children}
    </label>
  )
}

export function Modal({
  open,
  onClose,
  title,
  label,
  description,
  size = 'sm',
  headerBorder = true,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  label?: string
  description?: string
  size?: 'xs' | 'sm' | 'md' | 'lg'

  headerBorder?: boolean
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const focusables = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
        ) ?? [],
      )

    ref.current?.focus()

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === 'Tab') {
        const items = focusables()
        const first = items[0]
        const last = items[items.length - 1]
        if (!first || !last) return
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus?.()
    }
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="presentation">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`flex max-h-[85vh] w-full ${SIZE[size]} flex-col rounded-md border border-line-strong bg-surface shadow-lg focus:outline-none`}
      >
        <div className={`flex items-start justify-between gap-3 px-6 py-4 ${headerBorder ? 'border-b border-line' : ''}`}>
          <div className="min-w-0">
            {label ? <p className="text-xs font-bold uppercase tracking-wide text-muted">{label}</p> : null}
            <h2 className="text-lg font-semibold text-ink">{title}</h2>
            {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 -mt-1 shrink-0 rounded p-1.5 text-ink-muted transition-colors hover:bg-sunk hover:text-ink">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}
