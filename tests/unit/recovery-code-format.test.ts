import { describe, expect, it } from 'vitest'
import {
  formatRecoveryCode,
  normalizeRecoveryCode,
  RECOVERY_CODE_ALPHABET,
  recoveryCodesFileText,
} from '@/lib/auth/recovery-code-format'

describe('recovery code format', () => {
  it('has no look-alike characters', () => {
    for (const ch of ['0', 'O', '1', 'I', 'L']) expect(RECOVERY_CODE_ALPHABET).not.toContain(ch)
  })

  it('shows codes as XXXXX-XXXXX and accepts them however they are typed', () => {
    expect(formatRecoveryCode('ABCDEFGHJK')).toBe('ABCDE-FGHJK')
    expect(normalizeRecoveryCode(' abcde-fghjk ')).toBe('ABCDEFGHJK')
    expect(normalizeRecoveryCode('ABCDE FGHJK')).toBe('ABCDEFGHJK')
  })

  it('the downloaded file names the login ID and lists every code', () => {
    const text = recoveryCodesFileText('s261234@staff.moments.com', ['AAAAA-BBBBB', 'CCCCC-DDDDD'], '07 Oct 2026, 10:00 am')
    expect(text).toContain('Login ID: s261234@staff.moments.com')
    expect(text).toContain('1. AAAAA-BBBBB')
    expect(text).toContain('2. CCCCC-DDDDD')
    expect(text).toContain('Each code works once')
  })
})
