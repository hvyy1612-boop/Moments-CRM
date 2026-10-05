import { describe, expect, it } from 'vitest'
import { can } from '@/lib/auth/authz'
import { csvCell } from '@/lib/csv'

/** Bug-scan 2026-10-05: security fixes that need no database. */

describe('money operations are admin only', () => {
  it('only an ADMIN may refund, void or delete money records', () => {
    expect(can({ role: 'ADMIN' }, 'MONEY_ADMIN')).toBe(true)
    expect(can({ role: 'STUDIO' }, 'MONEY_ADMIN')).toBe(false)
    expect(can({ role: 'EDITOR' }, 'MONEY_ADMIN')).toBe(false)
    expect(can(null, 'MONEY_ADMIN')).toBe(false)
  })
})

describe('client CSV export cannot carry a spreadsheet formula', () => {
  it('prefixes values that start like a formula', () => {
    expect(csvCell('=HYPERLINK("http://x","Click")')).toBe(`"'=HYPERLINK(""http://x"",""Click"")"`)
    expect(csvCell('+61 400 000 000')).toBe("'+61 400 000 000")
    expect(csvCell('-5')).toBe("'-5")
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)")
  })

  it('leaves ordinary values alone and still quotes commas', () => {
    expect(csvCell('Olivia Brown')).toBe('Olivia Brown')
    expect(csvCell('Smith, Jane')).toBe('"Smith, Jane"')
    expect(csvCell('')).toBe('')
  })
})
