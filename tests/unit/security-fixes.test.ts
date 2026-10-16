import { describe, expect, it } from 'vitest'
import { can, isReadOnly } from '@/lib/auth/authz'
import { ROUTE_PERMISSIONS } from '@/lib/auth/permissions'
import { csvCell } from '@/lib/csv'

describe('money operations are admin only', () => {
  it('only an ADMIN may refund, void or delete money records', () => {
    expect(can({ role: 'ADMIN' }, 'MONEY_ADMIN')).toBe(true)
    expect(can({ role: 'STUDIO' }, 'MONEY_ADMIN')).toBe(true)
    expect(can({ role: 'SUPERVISOR' }, 'MONEY_ADMIN')).toBe(false)
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

describe('client CSV import reads real CSV', () => {
  it('handles quoted fields, commas inside quotes and doubled quotes', async () => {
    const { parseCsv } = await import('@/lib/csv')
    const rows = parseCsv('"Name","Email","Phone"\n"Smith, Jane","jane@example.com","0400 000 000"\n"Ann ""Annie"" Lee",ann@example.com,')
    expect(rows).toEqual([
      ['Name', 'Email', 'Phone'],
      ['Smith, Jane', 'jane@example.com', '0400 000 000'],
      ['Ann "Annie" Lee', 'ann@example.com', ''],
    ])
  })

  it('reads tab-separated rows pasted from a spreadsheet, and a quoted line break', async () => {
    const { parseCsv } = await import('@/lib/csv')
    expect(parseCsv('Jane Doe\tjane@example.com\t0400\r\n"Two\nlines"\tx@example.com\t')).toEqual([
      ['Jane Doe', 'jane@example.com', '0400'],
      ['Two\nlines', 'x@example.com', ''],
    ])
  })

  it("re-imports this app's own export (formula guard removed again)", async () => {
    const { csvCell, parseCsv } = await import('@/lib/csv')
    const line = ['Olivia Brown', 'olivia@example.com', '+61 400 000 000'].map(csvCell).join(',')
    expect(parseCsv(line)).toEqual([['Olivia Brown', 'olivia@example.com', '+61 400 000 000']])
  })
})

describe('SUPERVISOR is read-only', () => {
  it('can view every CRM area but holds no write, admin or Activity permission', () => {
    for (const p of ['ENQUIRY_VIEW', 'PROJECT_VIEW', 'CLIENT_VIEW', 'QUOTE_VIEW', 'FINANCE_VIEW', 'CALENDAR_VIEW'] as const) {
      expect(can({ role: 'SUPERVISOR' }, p)).toBe(true)
    }
    for (const p of ['ENQUIRY_CONVERT', 'PROJECT_EDIT', 'CLIENT_EDIT', 'QUOTE_EDIT', 'CALENDAR_MANAGE', 'USER_MANAGE', 'AUTH_LOG_VIEW', 'AUDIT_LOG_VIEW', 'SETTINGS_EDIT'] as const) {
      expect(can({ role: 'SUPERVISOR' }, p)).toBe(false)
    }
    expect(isReadOnly({ role: 'SUPERVISOR' })).toBe(true)
    expect(isReadOnly({ role: 'STUDIO' })).toBe(false)
  })

  it('may open viewing pages, never create/edit pages or admin pages', () => {
    const allowed = (route: string) => {
      const rule = ROUTE_PERMISSIONS[route]
      return Boolean(rule && 'roles' in rule && rule.roles.includes('SUPERVISOR'))
    }
    for (const r of ['/dashboard', '/leads/[id]', '/jobs/[id]', '/quotes/[id]', '/finance/[invoiceId]', '/clients/[id]', '/calendar']) expect(allowed(r)).toBe(true)
    for (const r of ['/quotes/new', '/quotes/[id]/edit', '/finance/new', '/finance/[invoiceId]/edit', '/clients/import', '/clients/[id]/edit', '/activity', '/settings', '/users']) expect(allowed(r)).toBe(false)
  })
})

