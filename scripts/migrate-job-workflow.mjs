

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const COMMIT = process.argv.includes('--commit')

const TERMINAL = new Set(['COMPLETED', 'CLOSED', 'CANCELLED', 'LOST', 'ARCHIVED'])
const OLD_STAGE_KEYS = new Set(['planning', 'finalprep', 'shootday'])

const NEW_TASKS = [
  { stage: 'preshoot', title: 'Confirm shoot details', type: 'TODO', offset: -14 },
  { stage: 'preshoot', title: 'Send pre-shoot reminder', type: 'TODO', offset: -7 },
  { stage: 'shoot', title: 'Mark shoot completed', type: 'SHOOT', offset: 0 },
  { stage: 'editing', title: 'Send files to editor', type: 'TODO', offset: 2 },
  { stage: 'editing', title: 'Confirm editing completed', type: 'TODO', offset: 21 },
  { stage: 'editing', title: 'Review final edits', type: 'TODO', offset: 28 },
  { stage: 'delivery', title: 'Prepare client gallery', type: 'TODO', offset: 35 },
  { stage: 'delivery', title: 'Send client gallery', type: 'TODO', offset: 42 },
  { stage: 'delivery', title: 'Issue final invoice', type: 'TODO', offset: 42 },
]

const CARRY = {
  'Send client gallery': 'Send final gallery to client',
  'Mark shoot completed': 'Photograph and film the wedding day',
  'Confirm shoot details': 'Confirm final timeline and shoot details',
}

async function main() {
  console.log(`\n=== Job workflow migration (${COMMIT ? 'COMMIT' : 'DRY-RUN'}) ===\n`)
  const projects = await prisma.project.findMany({
    select: {
      id: true, code: true, name: true, companyId: true, lifecycleStatus: true,
      workItems: { select: { id: true, title: true, stage: true, status: true, completedAt: true, completedByUserId: true, dueOverrideAt: true } },
    },
  })

  let affected = 0, skippedTerminal = 0, skippedNew = 0
  let totalDeleted = 0, totalCreated = 0, totalCarried = 0

  for (const p of projects) {
    if (TERMINAL.has(p.lifecycleStatus)) { skippedTerminal++; continue }
    const isOld = p.workItems.some((w) => OLD_STAGE_KEYS.has(w.stage ?? ''))
    if (!isOld) { skippedNew++; continue }

    affected++
    const carried = []
    const creates = NEW_TASKS.map((t, i) => {
      const oldTitle = CARRY[t.title]
      const src = oldTitle ? p.workItems.find((w) => w.title === oldTitle && w.status === 'COMPLETED') : null
      if (src) carried.push(`${t.title}  <=  ${oldTitle}`)
      return {
        companyId: p.companyId, projectId: p.id, kind: 'TASK', stage: t.stage, type: t.type, title: t.title,
        status: src ? 'COMPLETED' : 'PENDING', order: i, dueAnchor: 'SHOOT', dueOffsetDays: t.offset,
        completedAt: src?.completedAt ?? null, completedByUserId: src?.completedByUserId ?? null,
        dueOverrideAt: src?.dueOverrideAt ?? null,
      }
    })

    totalDeleted += p.workItems.length
    totalCreated += creates.length
    totalCarried += carried.length

    console.log(`• ${p.code}  ${p.name}  [${p.lifecycleStatus}]`)
    console.log(`    delete ${p.workItems.length} old task row(s): ${p.workItems.map((w) => `${w.title}${w.status === 'COMPLETED' ? '✓' : ''}`).join(' | ') || '(none)'}`)
    console.log(`    create ${creates.length} new task(s); carry completion: ${carried.length ? carried.join('  ,  ') : 'none'}`)

    if (COMMIT) {
      await prisma.$transaction(async (tx) => {
        await tx.workItem.deleteMany({ where: { projectId: p.id } })
        await tx.workItem.createMany({ data: creates })
      })
      console.log(`    ✓ applied`)
    }
    console.log('')
  }

  console.log('=== Summary ===')
  console.log(`Active jobs migrated : ${affected}`)
  console.log(`Skipped (terminal)   : ${skippedTerminal}`)
  console.log(`Skipped (already new): ${skippedNew}`)
  console.log(`Old task rows ${COMMIT ? 'deleted' : 'to delete'} : ${totalDeleted}`)
  console.log(`New task rows ${COMMIT ? 'created' : 'to create'} : ${totalCreated}`)
  console.log(`Completions ${COMMIT ? 'preserved' : 'to preserve'}: ${totalCarried}`)
  console.log(COMMIT ? '\nDONE (committed).' : '\nDRY-RUN only — nothing changed. Re-run with --commit to apply.')
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
