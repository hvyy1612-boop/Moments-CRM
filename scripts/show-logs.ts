
import { PrismaClient } from '@prisma/client'
import { maskEmail } from '../src/lib/text'

const prisma = new PrismaClient()

async function main() {
  const take = Number(process.argv[2] ?? '20') || 20

  const logins = await prisma.securityEvent.findMany({
    orderBy: { createdAt: 'desc' },
    take,
    select: { createdAt: true, eventType: true, outcome: true, emailAttempted: true, ipAddress: true },
  })

  console.log(`\n=== Sign-in activity (security_events) — latest ${logins.length} ===`)
  for (const e of logins) {
    const who = e.emailAttempted ? maskEmail(e.emailAttempted) : '-'
    console.log(
      `${e.createdAt.toISOString()}  ${e.eventType.padEnd(20)} ${String(e.outcome).padEnd(8)} ${who.padEnd(22)} ${e.ipAddress}`,
    )
  }

  const actions = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take,
    select: { createdAt: true, action: true, entityType: true, entityId: true, source: true },
  })

  console.log(`\n=== Activity log (audit_logs) — latest ${actions.length} ===`)
  for (const a of actions) {
    console.log(
      `${a.createdAt.toISOString()}  ${a.action.padEnd(24)} ${a.entityType.padEnd(10)} ${a.entityId.padEnd(28)} ${a.source ?? '-'}`,
    )
  }
  console.log('')
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
