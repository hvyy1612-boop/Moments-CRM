import { describe, it, expect, beforeEach, vi } from 'vitest'

const { queryRaw } = vi.hoisted(() => ({ queryRaw: vi.fn() }))
vi.mock('@/lib/db', () => ({ prisma: { $queryRaw: queryRaw } }))

import { GET } from '@/app/api/health/route'

describe('GET /api/health (§12.16)', () => {
  beforeEach(() => {
    queryRaw.mockReset()
  })

  it('returns 200 and reports the database up when the connectivity query succeeds', async () => {
    queryRaw.mockResolvedValue([{ ok: 1 }])
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok', database: 'up' })
  })

  it('returns 503 and reports the database down when the connectivity query fails', async () => {
    queryRaw.mockRejectedValue(new Error('connection refused'))
    const res = await GET()
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ status: 'error', database: 'down' })
  })
})
