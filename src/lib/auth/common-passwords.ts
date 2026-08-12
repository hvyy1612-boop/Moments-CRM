/**
 * A starter blocklist of common passwords (SEC-P04). Comparison is case-insensitive, so entries are
 * lowercase. Because the minimum length is 12 (PASSWORD_MIN_LENGTH), the useful entries are the
 * 12-plus character passwords and passphrases people actually reuse; the shorter classics are kept
 * for completeness even though the length rule already rejects them.
 *
 * This is deliberately small and readable for the capstone. In production it would be swapped for a
 * hashed lookup against a breach corpus (for example Have I Been Pwned's k-anonymity range API);
 * that swap is a drop-in behind checkPasswordPolicy and is noted for later.
 */
export const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  // classic short ones (already blocked by length, listed for completeness)
  'password',
  '123456',
  '12345678',
  'qwerty',
  'abc123',
  'iloveyou',
  'admin',
  'welcome',
  'letmein',
  'monkey',
  // 12-plus character reused passwords and keyboard walks
  'password1234',
  'password123456',
  'passwordpassword',
  '123456789012',
  '1234567890123',
  '123456789012345',
  'qwertyuiop12',
  'qwertyuiop1234',
  'qwertyuiopasdf',
  'iloveyou1234',
  'iloveyoumore',
  'letmein123456',
  'welcome123456',
  'admin1234567',
  'administrator',
  'trustno1234567',
  'football1234',
  'baseball1234',
  'sunshine1234',
  'princess1234',
  'dragon123456',
  'monkey123456',
  'superman1234',
  'batman123456',
  'michael12345',
  'charlie12345',
  'whatever1234',
  'starwars1234',
  'computer1234',
  'momentsphotography',
  'photography123',
  'changeme1234',
  'passw0rd1234',
  'p@ssw0rd1234',
  'qazwsxedc123',
  'zaq12wsx34ed',
])
