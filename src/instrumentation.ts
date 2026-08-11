// Runs once when the server process starts (Next.js instrumentation hook). Validating the
// environment here means the app refuses to boot if a required variable is missing or malformed
// (SEC-A08); importing '@/lib/env' throws on invalid configuration.
export async function register() {
  await import('@/lib/env')
}
