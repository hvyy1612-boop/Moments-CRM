export default function HomePage() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl text-ink">Moments — Client Management</h1>
      <p className="mt-4 text-ink-muted">
        Internal system for Moments Photography and Film. The public enquiry experience and the
        staff console are built in the slices that follow this foundation.
      </p>
      <p className="mt-4">
        <a className="text-ink underline" href="/api/health">
          Service health
        </a>
      </p>
    </main>
  )
}
