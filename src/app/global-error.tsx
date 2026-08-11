'use client'

import './globals.css'

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en-AU">
      <body>
        <main className="mx-auto max-w-2xl p-8">
          <h1 className="text-2xl text-ink">Something went wrong</h1>
          <p className="mt-4 text-ink-muted">
            The application hit an unexpected error. Please try again.
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-6 rounded border border-line px-4 py-2 text-ink"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  )
}
