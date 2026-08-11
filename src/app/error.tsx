'use client'

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl text-ink">Something went wrong</h1>
      <p className="mt-4 text-ink-muted">
        This page could not be displayed. You can try again, or go back to the start.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded border border-line px-4 py-2 text-ink"
      >
        Try again
      </button>
    </main>
  )
}
