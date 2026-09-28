import { prisma } from '@/lib/db'
import { sydneyYmd, systemClock } from '@/lib/time'

/**
 * One source of truth for human-facing record numbers: `<PREFIX><YYYY><4-digit>`, per company, reset each
 * calendar year (Sydney time). Client `C20260001`, Enquiry `E20260001`, Quote `Q20260001`, Job `J20260001`,
 * Invoice `I20260001`. Every type uses a single-letter prefix so the numbers read consistently.
 *
 * Uniqueness is bulletproof by design (three layers):
 *  1. Each record's number column has a UNIQUE constraint — Postgres physically rejects a duplicate.
 *  2. `nextRecordNumber` increments a per-(company,type,year) counter row with a single atomic UPDATE
 *     (value = value + 1), so two concurrent callers can never receive the same value.
 *  3. Callers run inside `prisma.$transaction` and retry on a P2002, so a collision can never crash or
 *     produce a duplicate. NEVER derive a number from COUNT(*) or MAX(seq)+1 (read-then-write races).
 */

export type RecordType = 'CLIENT' | 'ENQUIRY' | 'QUOTE' | 'JOB' | 'INVOICE'

const PREFIX: Record<RecordType, string> = { CLIENT: 'C', ENQUIRY: 'E', QUOTE: 'Q', JOB: 'J', INVOICE: 'I' }

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

/** Format a number without touching the DB (e.g. for previews / backfill parity). */
export function formatRecordNumber(type: RecordType, year: number, seq: number): string {
  return `${PREFIX[type]}${year}${String(seq).padStart(4, '0')}`
}

/** The calendar year (Sydney) a number issued now belongs to. */
export function currentNumberYear(at: Date = systemClock.now()): number {
  return sydneyYmd(at).year
}

/**
 * Reserve and format the next number for (company × type × year). Atomic — the counter row is created at 1
 * or incremented by 1 in one statement, so concurrent callers serialise on the row and each gets a distinct
 * value. MUST be called inside a `prisma.$transaction(async (tx) => ...)` so the number and the record it
 * belongs to commit (or roll back) together.
 */
export async function nextRecordNumber(tx: Tx, companyId: string, type: RecordType, at: Date = systemClock.now()): Promise<string> {
  const year = sydneyYmd(at).year
  const counter = await tx.numberCounter.upsert({
    where: { companyId_type_year: { companyId, type, year } },
    create: { companyId, type, year, value: 1 },
    update: { value: { increment: 1 } },
    select: { value: true },
  })
  return formatRecordNumber(type, year, counter.value)
}

/** True when an error is a Postgres/Prisma unique-constraint violation (P2002) — retry the number then. */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  )
}
