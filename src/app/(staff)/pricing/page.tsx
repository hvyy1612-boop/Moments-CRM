import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { listActivePackages } from '@/lib/domain/package'
import { PageHeader } from '@/components/PageHeader'
import { DASHBOARD_CRUMB } from '@/components/Breadcrumb'
import { AppShell } from '../AppShell'
import { PageContainer } from '@/components/PageContainer'
import { PricingCalculator, type CatalogPackage } from './PricingCalculator'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Price calculator - Moments' }

/**
 * Price calculator (brief: "packages, pricing calculations, quotations"). Loads the fixed-price catalogue
 * and hands it to an interactive builder that totals live (line net, GST ÷11, deposit split) through the
 * sourced pricing module. Read-only estimate: it does not persist a quote.
 */
export default async function PricingPage() {
  const user = await requireRole('/pricing')
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  const packages = await listActivePackages()
  const catalog: CatalogPackage[] = packages.map((p) => ({ id: p.id, name: p.name, price: p.basePriceInclGst.toFixed(2) }))

  return (
    <AppShell user={user} csrf={csrf} active="pricing">
      <PageContainer variant="standard">
      <PageHeader
        breadcrumb={[DASHBOARD_CRUMB, { label: 'Price calculator' }]}
        title="Price calculator"
      />
      <PricingCalculator packages={catalog} />
      </PageContainer>
    </AppShell>
  )
}
