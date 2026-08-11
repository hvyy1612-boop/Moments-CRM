import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET /api/health — liveness plus a database connectivity check (§12.16).
// Permission: public (declared in src/lib/auth/permissions.ts).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(): Promise<NextResponse> {
  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({ status: 'ok', database: 'up' }, { status: 200 })
  } catch {
    // Never leak the underlying error to the caller (SEC-A07).
    return NextResponse.json({ status: 'error', database: 'down' }, { status: 503 })
  }
}
