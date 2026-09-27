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

export default async function PricingPage() {
  const user = await requireRole('/pricing')
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  const packages = await listActivePackages()
  const catalog: CatalogPackage[] = packages.map((p) => ({ id: p.id, name: p.name, price: p.basePriceInclGst.toFixed(2) }))

  return (
    <AppShell user={user} csrf={csrf} active="pricing">
      <PageContainer variant="narrow">
      <PageHeader
        breadcrumb={[DASHBOARD_CRUMB, { label: 'Price calculator' }]}
        title="Price calculator"
        description="Build a quote from the catalogue and see the total, GST and deposit update as you go. Package prices are fixed catalogue values; this screen only totals them."
      />
      <PricingCalculator packages={catalog} />
      </PageContainer>
    </AppShell>
  )
}
