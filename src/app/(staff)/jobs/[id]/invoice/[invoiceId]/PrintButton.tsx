'use client'

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded bg-ink px-4 py-2 text-sm font-bold text-surface hover:opacity-90"
    >
      Print / Save as PDF
    </button>
  )
}
