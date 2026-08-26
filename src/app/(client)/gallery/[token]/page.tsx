import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { formatSydneyDate } from '@/lib/time'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Your gallery - Moments' }

export default async function ClientGalleryPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  const gallery = await prisma.gallery.findUnique({
    where: { accessToken: token },
    include: {
      items: { orderBy: { sortOrder: 'asc' } },
      project: { include: { client: { select: { displayName: true } } } },
    },
  })
  if (!gallery || gallery.status !== 'PUBLISHED') notFound()

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-12">
      <p className="text-sm font-medium uppercase tracking-wide text-accent">
        Moments Photography and Film
      </p>
      <h1 className="mt-2 text-2xl text-ink">{gallery.title}</h1>
      <p className="mt-1 text-ink-muted">
        Prepared for {gallery.project.client.displayName}
        {gallery.publishedAt ? ` · delivered ${formatSydneyDate(gallery.publishedAt)}` : ''}.
      </p>

      <section className="mt-8 rounded border border-line bg-surface p-5">
        {gallery.items.length === 0 ? (
          <p className="text-sm text-ink-muted">This gallery is empty.</p>
        ) : (
          <ul className="flex flex-col">
            {gallery.items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 border-b border-line py-3 text-sm last:border-b-0"
              >
                <span className="text-ink">{item.caption}</span>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent underline"
                >
                  Open
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-6 text-sm text-ink-muted">
        Thank you for choosing Moments. Please contact us if you have any questions.
      </p>
    </main>
  )
}
