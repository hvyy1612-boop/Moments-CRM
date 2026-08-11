import { z } from 'zod'

/**
 * Environment validation (SEC-A08).
 *
 * Parsed once at module load; the app refuses to boot if a required variable is missing or
 * malformed. The required set grows as later slices need more (SESSION_SECRET in Slice 2,
 * CRON_SECRET in Slice 6). Never put secrets in the repository — see .env.example.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n')
  throw new Error(`Invalid or missing environment variables:\n${issues}`)
}

export const env = parsed.data
