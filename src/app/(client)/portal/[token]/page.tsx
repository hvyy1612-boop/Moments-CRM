import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getClientPortalByToken } from '@/lib/domain/client'
import { formatAud } from '@/lib/money'
import { formatSydneyDate } from '@/lib/time'
import { titleCase } from '@/lib/text'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Your portal - Moments' }

export default async function ClientPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const c = await getClientPortalByToken(token)
  if (!c) notFound()

  return (
    <div className="min-h-screen bg-paper px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <div className="text-xs uppercase tracking-[0.18em] text-muted">{c.company.name}</div>
          <h1 className="mt-1 font-serif text-2xl font-semibold text-ink">Welcome, {c.displayName}</h1>
          <p className="mt-1 text-sm text-ink-muted">Everything for your bookings in one place.</p>
        </div>

        {c.projects.length === 0 ? (
          <p className="rounded-md border border-dashed border-line bg-surface px-4 py-8 text-center text-sm text-ink-muted">Nothing to show yet.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {c.projects.map((p) => (
              <section key={p.id} className="rounded-md border border-line bg-surface p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-3">
                  <h2 className="font-serif text-lg font-semibold text-ink">{p.name}</h2>
                  <span className="text-xs text-ink-muted">{titleCase(p.lifecycleStatus.replace(/_/g, ' '))}</span>
                </div>
                {p.bookings[0] ? (
                  <p className="mt-3 text-sm text-ink-muted">Shoot: {formatSydneyDate(p.bookings[0].startsAt)}</p>
                ) : null}

                {p.invoices.length > 0 ? (
                  <div className="mt-3">
                    <div className="text-xs font-bold uppercase tracking-wide text-muted">Invoices</div>
                    <ul className="mt-1 flex flex-col gap-1">
                      {p.invoices.map((inv, i) => (
                        <li key={i} className="flex items-center justify-between gap-2 text-sm">
                          <span className="text-ink-muted">{inv.invoiceNumber} · {inv.total.sub(inv.amountPaid).greaterThan(0) ? `${formatAud(inv.total.sub(inv.amountPaid))} due` : 'paid'}</span>
                          {inv.accessToken ? <Link href={`/invoice/${inv.accessToken}`} className="font-bold text-accent hover:underline">View</Link> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {p.questionnaires.length > 0 ? (
                  <div className="mt-3">
                    <div className="text-xs font-bold uppercase tracking-wide text-muted">Questionnaires</div>
                    <ul className="mt-1 flex flex-col gap-1">
                      {p.questionnaires.map((q, i) => (
                        <li key={i} className="flex items-center justify-between gap-2 text-sm">
                          <span className="text-ink-muted">{q.title ?? 'Questionnaire'} · {q.status.toLowerCase()}</span>
                          {q.accessToken ? <Link href={`/questionnaire/${q.accessToken}`} className="font-bold text-accent hover:underline">{q.status === 'COMPLETED' ? 'View' : 'Fill in'}</Link> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {p.galleries.length > 0 ? (
                  <div className="mt-3">
                    <div className="text-xs font-bold uppercase tracking-wide text-muted">Galleries</div>
                    <ul className="mt-1 flex flex-col gap-1">
                      {p.galleries.map((g, i) => (
                        <li key={i} className="flex items-center justify-between gap-2 text-sm">
                          <span className="text-ink-muted">{g.title}</span>
                          <Link href={`/gallery/${g.accessToken}`} className="font-bold text-accent hover:underline">Open</Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
