import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl text-ink">Page not found</h1>
      <p className="mt-4 text-ink-muted">That page does not exist.</p>
      <p className="mt-6">
        <Link className="text-ink underline" href="/">
          Back to the start
        </Link>
      </p>
    </main>
  )
}
