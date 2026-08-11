import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(): Promise<NextResponse> {
  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({ status: 'ok', database: 'up' }, { status: 200 })
  } catch {

    return NextResponse.json({ status: 'error', database: 'down' }, { status: 503 })
  }
}
