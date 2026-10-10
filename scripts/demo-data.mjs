

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const DEMO_EMAIL = '@demo.moments'
const PFX = 'DEMO-'
const pick = (a) => a[Math.floor(Math.random() * a.length)]
const rint = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1))
const money = (lo, hi) => Math.round(rint(lo, hi) / 50) * 50

const OCCASIONS = ['Wedding', 'Wedding', 'Wedding', 'Wedding', 'Engagement', 'Engagement', 'Anniversary', 'Portrait', 'Portrait', 'Event']
const COVERAGE = ['Photography', 'Photography', 'Photography', 'Both', 'Both', 'Both', 'Videography', 'Videography']
const SOURCES = ['Website', 'Website', 'Referral', 'Referral', 'Referral', 'Instagram', 'Instagram', 'Google', 'Wedding fair']
const STAGES = ['preshoot', 'shoot', 'editing', 'delivery']
const MONTH_COUNT = [4, 2, 3, 4, 5, 3, 3, 3, 4, 4, 2, 3]
const FIRST = ['Olivia', 'Sarah', 'Mia', 'Linh', 'Grace', 'Hannah', 'Emily', 'Chloe', 'Ava', 'Ruby', 'Zoe', 'Ella']
const LAST = ['Nguyen', 'Tran', 'Smith', 'Brown', 'Lee', 'Walker', 'Clark', 'Pham', 'Young', 'Hill', 'Baker', 'Reed']

function monthsAgo(m, day) {
  const d = new Date()
  d.setMonth(d.getMonth() - m)
  d.setDate(day)
  d.setHours(12, 0, 0, 0)
  return d
}

async function wipe() {
  const inv = { invoiceNumber: { startsWith: PFX } }

  const TRIG = 'ALTER TABLE payment_transactions %s TRIGGER "PaymentTransaction_insert_only"'
  try {
    await prisma.$executeRawUnsafe(TRIG.replace('%s', 'DISABLE'))
    await prisma.paymentTransaction.deleteMany({ where: { payment: { invoice: inv } } })
  } finally {
    await prisma.$executeRawUnsafe(TRIG.replace('%s', 'ENABLE'))
  }
  await prisma.payment.deleteMany({ where: { invoice: inv } })
  await prisma.invoiceLine.deleteMany({ where: { invoice: inv } })
  await prisma.invoice.deleteMany({ where: { invoiceNumber: { startsWith: PFX } } })
  await prisma.workItem.deleteMany({ where: { project: { code: { startsWith: PFX } } } })
  await prisma.project.deleteMany({ where: { code: { startsWith: PFX } } })
  await prisma.enquiry.deleteMany({ where: { enquiryNumber: { startsWith: PFX } } })
  const del = await prisma.client.deleteMany({ where: { email: { endsWith: DEMO_EMAIL } } })
  console.log(`Wiped demo data (removed ${del.count} demo clients + their tagged records). Real data untouched.`)
}

async function seed() {
  await wipe()
  const company = await prisma.company.findFirst()
  if (!company) throw new Error('No company row found')
  const companyId = company.id

  let seq = 0
  let active = 0
  for (let m = 0; m < MONTH_COUNT.length; m++) {
    for (let k = 0; k < MONTH_COUNT[m]; k++) {
      seq++
      const fn = pick(FIRST)
      const ln = pick(LAST)
      const name = `${fn} ${ln}`
      const occasion = pick(OCCASIONS)
      const coverage = pick(COVERAGE)
      const source = pick(SOURCES)
      const confirmedAt = monthsAgo(m, m === 0 ? rint(1, Math.max(1, new Date().getDate())) : rint(2, 26))
      const value = money(3500, 12000)
      const n4 = String(seq).padStart(3, '0')

      const client = await prisma.client.create({ data: { companyId, displayName: name, firstName: fn, lastName: ln, email: `demo${seq}${DEMO_EMAIL}`, type: 'INDIVIDUAL', status: 'ACTIVE' } })
      const isActive = m <= 3 && active < 16
      if (isActive) active++
      const project = await prisma.project.create({
        data: { companyId, clientId: client.id, code: `${PFX}J-${n4}`, name: `${occasion} - ${ln}`, lifecycleStatus: isActive ? 'CONFIRMED' : 'COMPLETED', commercialStatus: 'DEPOSIT_PAID', source, confirmedByClientAt: confirmedAt },
      })
      await prisma.enquiry.create({
        data: { companyId, enquiryNumber: `${PFX}L-${n4}`, name, email: `demo${seq}${DEMO_EMAIL}`, eventType: occasion, coverage, source: 'WEBSITE', status: 'BOOKING_CONFIRMED', clientId: client.id, convertedClientId: client.id, convertedProjectId: project.id, createdAt: monthsAgo(m, 1) },
      })
      if (isActive) await prisma.workItem.create({ data: { companyId, projectId: project.id, kind: 'CUSTOM', type: 'TODO', stage: pick(STAGES), title: 'Next task', status: 'PENDING', order: 0 } })

      const roll = Math.random()
      const status = roll < 0.68 ? 'PAID' : roll < 0.8 ? 'PARTIALLY_PAID' : roll < 0.9 ? 'SENT' : 'OVERDUE'
      const issuedAt = confirmedAt
      const dueAt = new Date(issuedAt.getTime() + 14 * 86400000)
      if (status === 'OVERDUE' || status === 'PARTIALLY_PAID') dueAt.setTime(Math.min(dueAt.getTime(), Date.now() - rint(1, 40) * 86400000))
      const invoice = await prisma.invoice.create({
        data: { projectId: project.id, invoiceNumber: `${PFX}I-${n4}`, type: 'BALANCE', status, currency: 'AUD', subtotal: value, taxTotal: 0, total: value, amountPaid: 0, issuedAt, dueAt, billingNameSnapshot: name, lines: { create: [{ description: `${occasion} photography package`, itemName: occasion, quantity: 1, unitPrice: value, lineTotal: value }] } },
      })
      const frac = status === 'PAID' ? 1 : status === 'PARTIALLY_PAID' ? 0.4 : 0
      if (frac > 0) {
        const paid = Math.round(value * frac)
        const payment = await prisma.payment.create({ data: { invoiceId: invoice.id, projectId: project.id, amount: paid, currency: 'AUD', paymentMethod: 'BANK_TRANSFER', status: 'PAID', receivedAt: new Date(issuedAt.getTime() + 3 * 86400000) } })
        await prisma.paymentTransaction.create({ data: { paymentId: payment.id, type: 'CHARGE', amount: paid, currency: 'AUD', createdAt: new Date(issuedAt.getTime() + 3 * 86400000) } })
        await prisma.invoice.update({ where: { id: invoice.id }, data: { amountPaid: paid } })
      }
    }
  }

  const PIPE = [['NEW_ENQUIRY', 16], ['CONTACTED', 12], ['CONSULTATION', 8], ['QUOTE_SENT', 6], ['AWAITING_BOOKING_CONFIRMATION', 4], ['BOOKING_CONFIRMED', 3]]
  let p = 0
  const today = new Date().getDate()
  for (const [status, n] of PIPE) {
    for (let i = 0; i < n; i++) {
      p++
      await prisma.enquiry.create({
        data: { companyId, enquiryNumber: `${PFX}LP-${String(p).padStart(3, '0')}`, name: `${pick(FIRST)} ${pick(LAST)}`, email: `lead${p}${DEMO_EMAIL}`, eventType: pick(OCCASIONS), coverage: pick(COVERAGE), source: Math.random() < 0.5 ? 'WEBSITE' : 'MANUAL', status, createdAt: monthsAgo(0, rint(1, Math.max(1, Math.min(today, 28)))) },
      })
    }
  }
  console.log(`Demo seeded (additive, tagged): ${seq} bookings + ${p} pipeline leads, ${active} active jobs. All tagged DEMO-/@demo.moments. Run "wipe" to remove.`)
}

const mode = process.argv[2]
const run = mode === 'wipe' ? wipe : mode === 'seed' ? seed : null
if (!run) {
  console.error('Usage: node --env-file=.env scripts/demo-data.mjs <seed|wipe>')
  process.exit(1)
}
run().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
