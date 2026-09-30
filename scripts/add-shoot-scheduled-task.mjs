

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const COMMIT = process.argv.includes('--commit')

async function main() {
  console.log(`\n=== Backfill "Shoot scheduled" staff task (${COMMIT ? 'COMMIT' : 'DRY-RUN'}) ===\n`)
  const projects = await prisma.project.findMany({
    select: {
      id: true, code: true, name: true, companyId: true, lifecycleStatus: true,
      bookings: { select: { status: true, startsAt: true } },
      workItems: { select: { title: true, kind: true, stage: true, order: true } },
    },
  })

  let created = 0, skippedHas = 0, skippedNoShoot = 0

  for (const p of projects) {
    const shootRows = p.workItems.filter((w) => w.stage === 'shoot')

    if (shootRows.length === 0) { skippedNoShoot++; continue }

    const already = p.workItems.some((w) => w.kind === 'shoot_scheduled' || w.title === 'Shoot scheduled')
    if (already) { skippedHas++; continue }

    const shootScheduled = p.bookings.some((b) => b.status !== 'CANCELLED' && b.startsAt != null)
    const minOrder = Math.min(...shootRows.map((w) => w.order))
    const status = shootScheduled ? 'COMPLETED' : 'PENDING'

    console.log(`• ${p.code}  ${p.name}  [${p.lifecycleStatus}]  ->  add "Shoot scheduled" (${status}, order ${minOrder - 1})`)

    if (COMMIT) {
      await prisma.workItem.create({
        data: {
          companyId: p.companyId,
          projectId: p.id,
          kind: 'shoot_scheduled',
          stage: 'shoot',
          type: 'TODO',
          title: 'Shoot scheduled',
          status,
          order: minOrder - 1,
          dueAnchor: 'SHOOT',
          dueOffsetDays: 0,
          completedAt: shootScheduled ? new Date() : null,
        },
      })
    }
    created++
  }

  console.log('\n=== Summary ===')
  console.log(`Projects ${COMMIT ? 'given' : 'to give'} a "Shoot scheduled" task : ${created}`)
  console.log(`Skipped (already has it)                     : ${skippedHas}`)
  console.log(`Skipped (not on production workflow)          : ${skippedNoShoot}`)
  console.log(COMMIT ? '\nDONE (committed).' : '\nDRY-RUN only — nothing changed. Re-run with --commit to apply.')
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
