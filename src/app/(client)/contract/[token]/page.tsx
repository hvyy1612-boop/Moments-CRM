import { Prisma } from '@prisma/client'
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { Alert } from '@/components/ui/Alert'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { prisma } from '@/lib/db'
import type { ContractTermsSnapshot } from '@/lib/domain/contract'
import { formatAud } from '@/lib/money'
import { formatSydneyDate } from '@/lib/time'
import { ContractSign } from './ContractSign'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Your contract — Moments' }

export default async function ClientContractPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  const contract = await prisma.contract.findUnique({
    where: { signToken: token },
    include: { currentVersion: true },
  })
  if (!contract || !contract.currentVersion) notFound()

  const version = contract.currentVersion
  if (version.status === 'DRAFT') notFound()

  const terms = version.termsSnapshot as unknown as ContractTermsSnapshot
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-12">
      <p className="text-sm font-medium uppercase tracking-wide text-accent">
        Moments Photography and Film
      </p>
      <h1 className="mt-2 text-2xl text-ink">Your booking contract</h1>
      <p className="mt-1 text-ink-muted">
        Prepared for {terms.clientName} · {terms.projectCode}.
      </p>

      <section className="mt-8 rounded border border-line bg-surface p-5">
        <ul className="flex flex-col">
          {terms.lines.map((line, index) => (
            <li
              key={index}
              className="flex justify-between gap-3 border-b border-line py-2 text-sm last:border-b-0"
            >
              <span className="text-ink">
                {line.description} <span className="text-ink-muted">× {line.quantity}</span>
              </span>
              <span className="tabular-nums text-ink">{formatAud(new Prisma.Decimal(line.lineTotal))}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex justify-between text-sm">
          <span className="text-ink-muted">Includes GST</span>
          <span className="tabular-nums text-ink-muted">{formatAud(new Prisma.Decimal(terms.taxTotal))}</span>
        </div>
        <div className="mt-1 flex justify-between text-base font-medium">
          <span className="text-ink">Total</span>
          <span className="tabular-nums text-ink">{formatAud(new Prisma.Decimal(terms.total))}</span>
        </div>
      </section>

      <section className="mt-6 rounded border border-line bg-surface p-5">
        <h2 className="text-sm font-medium uppercase tracking-wide text-ink-muted">Terms</h2>
        <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-sm text-ink">
          {terms.terms.map((term, index) => (
            <li key={index}>{term}</li>
          ))}
        </ul>
      </section>

      <div className="mt-8">
        {version.status === 'SIGNED' ? (
          <Alert tone="success" title="This contract has been signed">
            Signed by {version.signedName} on{' '}
            {version.signedAt ? formatSydneyDate(version.signedAt) : ''}.
          </Alert>
        ) : version.status === 'SENT' ? (
          <ContractSign csrf={csrf} token={token} />
        ) : (
          <Alert tone="info" title="This contract is no longer available" />
        )}
      </div>
    </main>
  )
}
