// Логи (скилл observability): структурные, с контекстом запроса; ПДн и секреты маскируются (скилл personal-data).
import pino, { type Logger } from 'pino'
import { config } from './config.ts'

/**
 * Ключи, значения которых никогда не попадают в лог (любой уровень вложенности до 2). Ключ каждой колонки `pii()`
 * должен быть здесь — проверяет тест kernel/pii.test.ts.
 */
export const SECRET_KEYS = [
	'password',
	'token',
	'secret',
	'email',
	'phone',
	'name',
	'cookie',
	'authorization',
	'set-cookie',
	'ip',
	'ipAddress',
	'userAgent',
	'image',
]
export const REDACT_PATHS = SECRET_KEYS.flatMap((k) => [k, `*.${k}`, `*.*.${k}`])

export function createLogger(destination?: pino.DestinationStream): Logger {
	const options: pino.LoggerOptions = {
		level: config.NODE_ENV === 'test' ? 'silent' : (process.env.LOG_LEVEL ?? 'info'),
		redact: { paths: REDACT_PATHS, censor: '[скрыто]' },
		base: { service: 'api' },
		timestamp: pino.stdTimeFunctions.isoTime,
	}
	if (destination) return pino({ ...options, level: 'debug' }, destination)
	if (config.NODE_ENV === 'development') {
		return pino({
			...options,
			transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname,service' } },
		})
	}
	return pino(options)
}

export const log = createLogger()
export type { Logger }
