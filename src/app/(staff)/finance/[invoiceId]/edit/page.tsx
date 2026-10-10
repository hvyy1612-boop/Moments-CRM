import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { Breadcrumb, DASHBOARD_CRUMB } from '@/components/Breadcrumb'
import { PageContainer } from '@/components/PageContainer'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { JOB_SHOOT_SELECT, shootDateOfJob } from '@/lib/domain/deadline'
import { listActivePackages } from '@/lib/domain/package'
import { sydneyYmd } from '@/lib/time'
import { AppShell } from '../../../AppShell'
import { InvoiceEditor } from '../../../jobs/[id]/InvoiceEditor'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Edit invoice - Moments' }

function ymd(date: Date): string {
  const { year, month, day } = sydneyYmd(date)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export default async function EditInvoicePage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const user = await requireRole('/finance/[invoiceId]/edit')
  const { invoiceId } = await params
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  const inv = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true, invoiceNumber: true, type: true, status: true, amountPaid: true, invoiceDate: true, dueAt: true,
      poNumber: true, notes: true,
      billingNameSnapshot: true, billingEmailSnapshot: true, billingPhoneSnapshot: true, billingJobNameSnapshot: true,
      lines: { orderBy: { sortOrder: 'asc' }, select: { itemName: true, description: true, quantity: true, unitPrice: true, discount: true } },
      instalments: { orderBy: { sortOrder: 'asc' }, select: { label: true, dueAt: true, amount: true } },
      project: {
        select: {
          id: true, name: true,
          client: { select: { displayName: true, email: true, phone: true } },
          ...JOB_SHOOT_SELECT,
        },
      },
    },
  })
  if (!inv) notFound()
  const editable = inv.amountPaid.lte(0) && !['VOID', 'PAID', 'PARTIALLY_PAID'].includes(inv.status)
  if (!editable) redirect(`/finance/${inv.id}`)

  const packages = await listActivePackages()

  const discountLine = inv.lines.find((l) => l.itemName === 'Discount' && l.unitPrice.lessThan(0))
  const issueDate = inv.invoiceDate ? ymd(inv.invoiceDate) : ymd(new Date())

  const dueDays = inv.instalments.length <= 1 && inv.dueAt && inv.invoiceDate
    ? Math.round((inv.dueAt.getTime() - inv.invoiceDate.getTime()) / 86_400_000)
    : 0
  const shoot = shootDateOfJob(inv.project)

  return (
    <AppShell user={user} csrf={csrf} active="finance">
      <PageContainer variant="standard">
        <Breadcrumb
          items={[
            DASHBOARD_CRUMB,
            { label: 'Payments', href: '/finance' },
            { label: `Invoice #${inv.invoiceNumber}`, href: `/finance/${inv.id}` },
            { label: 'Edit' },
          ]}
        />
        <h1 className="mt-2 text-2xl font-semibold text-ink">Edit invoice #{inv.invoiceNumber}</h1>
        <InvoiceEditor
          csrf={csrf}
          projectId={inv.project.id}
          invoiceId={inv.id}
          packages={packages.map((p) => ({
            id: p.id, name: p.name, price: p.basePriceInclGst.toString(), description: p.description, inclusions: p.inclusions, isAddOn: p.isAddOn,
          }))}
          initial={{
            type: inv.type,
            invoiceNumber: inv.invoiceNumber,
            invoiceDate: issueDate,
            poNumber: inv.poNumber ?? '',
            notes: inv.notes ?? '',
            discount: discountLine ? discountLine.unitPrice.abs().toString() : '',
            discountReason: discountLine?.description ?? '',
            lines: inv.lines
              .filter((l) => l !== discountLine)
              .map((l) => ({

                name: l.itemName || l.description || '',
                description: l.itemName ? l.description : '',
                quantity: l.quantity,
                unitPrice: l.unitPrice.toString(),
                discount: l.discount.greaterThan(0) ? l.discount.toString() : '',
              })),

            instalments: inv.instalments.length > 1
              ? inv.instalments.map((it) => ({ label: it.label ?? '', dueAt: it.dueAt ? ymd(it.dueAt) : '', amount: it.amount.toString() }))
              : [],
          }}
          contact={{
            jobName: inv.billingJobNameSnapshot ?? inv.project.name,
            clientName: inv.billingNameSnapshot ?? inv.project.client.displayName,
            clientEmail: inv.billingEmailSnapshot ?? inv.project.client.email ?? '',
            clientPhone: inv.billingPhoneSnapshot ?? inv.project.client.phone ?? '',

            numberPreview: inv.invoiceNumber,
            defaultType: inv.type,
            issueDate,
            shootDate: shoot ? ymd(shoot) : null,
            due: dueDays === 7 ? 'NET7' : dueDays === 14 ? 'NET14' : 'ON_ISSUE',
          }}
        />
      </PageContainer>
    </AppShell>
  )
}
