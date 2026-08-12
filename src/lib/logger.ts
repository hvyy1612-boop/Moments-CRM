import { randomUUID } from 'node:crypto'

// One structured logger for application code (§17.3). No bare console.log elsewhere. Never pass
// personal data, tokens or password hashes into a log (BR-L04, SEC-P02).

type Level = 'info' | 'warn' | 'error'

function emit(level: Level, message: string, context?: Record<string, unknown>): void {
  const line = JSON.stringify({ level, message, time: new Date().toISOString(), ...context })
  if (level === 'error') process.stderr.write(`${line}\n`)
  else process.stdout.write(`${line}\n`)
}

export const logger = {
  info: (message: string, context?: Record<string, unknown>) => emit('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) => emit('warn', message, context),
  error: (message: string, context?: Record<string, unknown>) => emit('error', message, context),
}

/** A short id for tying a user-visible failure to its log line (§17.3). */
export function correlationId(): string {
  return randomUUID().slice(0, 8)
}
