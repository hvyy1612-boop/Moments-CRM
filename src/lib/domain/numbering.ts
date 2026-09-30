import { prisma } from '@/lib/db'
import { sydneyYmd, systemClock } from '@/lib/time'

export type RecordType = 'CLIENT' | 'ENQUIRY' | 'QUOTE' | 'JOB' | 'INVOICE'

const PREFIX: Record<RecordType, string> = { CLIENT: 'C', ENQUIRY: 'L', QUOTE: 'Q', JOB: 'J', INVOICE: 'I' }

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

export function formatRecordNumber(type: RecordType, year: number, seq: number): string {
  return `${PREFIX[type]}${year}${String(seq).padStart(4, '0')}`
}

export function currentNumberYear(at: Date = systemClock.now()): number {
  return sydneyYmd(at).year
}

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

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  )
}
