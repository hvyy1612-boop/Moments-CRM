#!/usr/bin/env node

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function ledgerNet(payments) {
  let net = 0
  for (const p of payments) {
    for (const t of p.transactions) {
      if (t.status !== 'SUCCEEDED') continue
      net += t.type === 'CHARGE' ? Number(t.amount) : -Number(t.amount)
    }
  }
  return net
}

const invoices = await prisma.invoice.findMany({
  select: {
    id: true,
    invoiceNumber: true,
    status: true,
    amountPaid: true,
    payments: { select: { transactions: { select: { type: true, status: true, amount: true } } } },
  },
})

let mismatch = 0
let voidWithMoney = 0
let withMoney = 0
const rows = []
for (const inv of invoices) {
  const cache = Number(inv.amountPaid)
  const ledger = ledgerNet(inv.payments)
  if (cache > 0.005) withMoney += 1
  if (inv.status === 'VOID' && cache > 0.005) {
    voidWithMoney += 1
    rows.push(`VOID-WITH-MONEY  ${inv.invoiceNumber}  cache=${cache.toFixed(2)}`)
  }
  if (Math.abs(cache - ledger) > 0.005) {
    mismatch += 1
    rows.push(`CACHE≠LEDGER     ${inv.invoiceNumber} [${inv.status}]  cache=${cache.toFixed(2)}  ledger=${ledger.toFixed(2)}  diff=${(cache - ledger).toFixed(2)}`)
  }
}

for (const r of rows) console.log(r)
console.log(
  `\nInvoices: ${invoices.length} | with money: ${withMoney} | VOID-with-money: ${voidWithMoney} | cache≠ledger: ${mismatch}`,
)

await prisma.$disconnect()
process.exit(mismatch > 0 || voidWithMoney > 0 ? 1 : 0)
