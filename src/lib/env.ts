import { z } from 'zod'

/**
 * Environment validation (SEC-A08).
 *
 * Parsed once at module load; the app refuses to boot if a required variable is missing or
 * malformed. Never put secrets in the repository - see .env.example.
 *
 * - SESSION_SECRET signs sessions and CSRF tokens (SEC-S01, SEC-A04). Required in production; in
 *   development and test the session layer falls back to a per-process secret when it is absent.
 * - GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are an optional pair for staff Google sign-in (§8.5).
 *   Setting one without the other is a boot failure with a named error.
 * - STRIPE_* are optional (§20.4, D-020). Absent means manual payment recording only (BR-OP08).
 */
const envSchema = z
  .object({
    DATABASE_URL: z.string().url(),
    DIRECT_URL: z.string().url().optional(),
    NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    SESSION_SECRET: z.string().min(32).optional(),
    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
    // Resend email delivery (optional). Both must be set together to send real email; otherwise the
    // adapter falls back to recording intent only (dev). EMAIL_FROM must be a Resend-verified sender.
    RESEND_API_KEY: z.string().min(1).optional(),
    EMAIL_FROM: z.string().min(1).optional(),
    // Gmail (or any) SMTP delivery (optional). Set SMTP_USER + SMTP_PASS (a Gmail App password - 2FA
    // must be on) to send real email FROM that Gmail account. SMTP_HOST/SMTP_PORT default to Gmail
    // (smtp.gmail.com:465). When set, SMTP takes precedence over Resend. The "from" is EMAIL_FROM if
    // set, otherwise SMTP_USER (Gmail requires the from to be the authenticated account or its alias).
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.string().min(1).optional(),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASS: z.string().min(1).optional(),
    // Authorises the Vercel Cron daily reminder call (Bearer token). Reminders run only when set.
    CRON_SECRET: z.string().min(1).optional(),
    STRIPE_SECRET_KEY: z.string().min(1).optional(),
    STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
    STRIPE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.NODE_ENV === 'production' && !val.SESSION_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SESSION_SECRET'],
        message: 'SESSION_SECRET is required in production (at least 32 characters)',
      })
    }
    if (Boolean(val.GOOGLE_CLIENT_ID) !== Boolean(val.GOOGLE_CLIENT_SECRET)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['GOOGLE_CLIENT_ID'],
        message: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together (§8.5)',
      })
    }
    if (Boolean(val.RESEND_API_KEY) !== Boolean(val.EMAIL_FROM)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['RESEND_API_KEY'],
        message: 'RESEND_API_KEY and EMAIL_FROM must be set together to send email',
      })
    }
    if (Boolean(val.SMTP_USER) !== Boolean(val.SMTP_PASS)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SMTP_USER'],
        message: 'SMTP_USER and SMTP_PASS must be set together to send email via SMTP',
      })
    }
  })

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n')
  throw new Error(`Invalid or missing environment variables:\n${issues}`)
}

export const env = parsed.data

/** Staff Google sign-in is available only when both Google variables are present (§8.5, BR-G01). */
export const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)

/** Stripe online payment is available only when the secret and webhook secret are present (BR-OP08). */
export const stripeEnabled = Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET)

/**
 * Whether the email provider can actually deliver: either Gmail/SMTP (SMTP_USER + SMTP_PASS) OR Resend
 * (RESEND_API_KEY + EMAIL_FROM) must be configured (docs/25 Part 4). This is the delivery gate, DISTINCT
 * from the per-company automation switch (`clientEmailsEnabled`) — a company must turn automation on AND
 * a provider must be configured before any client reminder is sent. With no provider, a send records
 * SKIPPED_NO_PROVIDER (never a fake sent).
 */
export const emailProviderReady = Boolean((env.SMTP_USER && env.SMTP_PASS) || (env.RESEND_API_KEY && env.EMAIL_FROM))
