import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Proves the environment validation gate (SEC-A08): the module refuses to load when a required
// variable is missing, and loads a valid configuration. env.ts validates at import time, so each
// case resets the module registry and sets process.env before a fresh dynamic import.
describe('environment validation (SEC-A08)', () => {
  const snapshot = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...snapshot }
  })

  afterEach(() => {
    process.env = snapshot
  })

  it('refuses to load when DATABASE_URL is missing', async () => {
    delete process.env.DATABASE_URL
    await expect(import('@/lib/env')).rejects.toThrow(/environment variables/i)
  })

  it('rejects a malformed DATABASE_URL', async () => {
    process.env.DATABASE_URL = 'not-a-url'
    await expect(import('@/lib/env')).rejects.toThrow(/environment variables/i)
  })

  it('loads a valid configuration', async () => {
    process.env.DATABASE_URL = 'postgresql://user@localhost:5432/db?schema=public'
    const mod = await import('@/lib/env')
    expect(mod.env.DATABASE_URL).toContain('postgresql://')
  })
})
