

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
