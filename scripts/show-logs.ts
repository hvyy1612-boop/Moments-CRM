/**
 * Print the activity log to the terminal — the same two append-only tables the /activity page reads,
 * but as plain data you can inspect in code form instead of the website:
 *   - security_events (sign-in history: login success/failure, logout, password reset)
 *   - audit_logs      (who changed what in the CRM)
 *
 * Email is masked and the password hash / session token / reset token are never selected, matching
 * the app. Runs against whatever DATABASE_URL points at:
 *
 *   npm run show-logs                                   # last 20 of each, local DB
 *   npm run show-logs -- 50                             # last 50 of each
 *   DATABASE_URL='<neon-url>' npm run show-logs         # the live (Neon) logs
 */
import { PrismaClient } from '@prisma/client'
import { maskEmail } from '../src/lib/text'

const prisma = new PrismaClient()

async function main() {
  const take = Number(process.argv[2] ?? '20') || 20

  const logins = await prisma.signInLog.findMany({
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
