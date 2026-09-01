'use client'

export function PrintButton({ label = 'Print / Save as PDF' }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded bg-ink px-4 py-2 text-sm font-bold text-surface hover:opacity-90 print:hidden"
    >
      {label}
    </button>
  )
}
