// One-off backfill: "Shoot scheduled" changed from a read-only SYSTEM milestone (owner = System, auto)
// into a normal staff task (owner = staff, manually ticked). New jobs get it from DEFAULT_PROJECT_TASKS;
// this adds the matching WorkItem to EXISTING jobs so the row does not disappear when the auto milestone
// is removed from the code.
//
// For each project already on the production workflow (has any 'shoot'-stage WorkItem) that does NOT yet
// have a 'shoot_scheduled' task, it inserts one at the top of the Shoot stage. To preserve what staff
// currently see, it starts COMPLETED when a shoot date is already booked (the old auto done-state), else
// PENDING. Idempotent: a project that already has the task is skipped.
//
// DRY-RUN by default: prints what WOULD change and mutates nothing. Pass --commit to apply.
// Run:  node --env-file=.env scripts/add-shoot-scheduled-task.mjs           (dry-run)
//       node --env-file=.env scripts/add-shoot-scheduled-task.mjs --commit  (apply)

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
    // Only projects already on the production workflow (they have a Shoot stage).
    if (shootRows.length === 0) { skippedNoShoot++; continue }
    // Idempotent: skip if the task already exists (by stable kind or by title).
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
