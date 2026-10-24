import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

// Локально переменные берутся из корневого .env (скилл local-env); в CI и проде — из окружения.
const envFile = fileURLToPath(new URL('../../../../.env', import.meta.url))
if (existsSync(envFile)) process.loadEnvFile(envFile)

const Env = z.object({
	NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
	API_PORT: z.coerce.number().int().default(3000),
	DATABASE_URL: z.url(),
	DATABASE_URL_OWNER: z.url(),

	APP_DOMAIN: z.string().min(1),
	APP_PROTOCOL: z.enum(['http', 'https']).default('https'),
	APP_PUBLIC_PORT: z.string().default(''),

	AUTH_SECRET: z.string().min(32),

	MAIL_TRANSPORT: z.enum(['smtp', 'memory']).default('smtp'),
	SMTP_HOST: z.string().default('localhost'),
	SMTP_PORT: z.coerce.number().int().default(1025),
	SMTP_FROM: z.string().min(1),
})

export type Config = z.infer<typeof Env>

export const config: Config = Env.parse(process.env)

/** Origin корневого домена или школы: `<protocol>://[<slug>.]<APP_DOMAIN>[:<port>]`. */
export function appOrigin(slug?: string): string {
	const host = slug ? `${slug}.${config.APP_DOMAIN}` : config.APP_DOMAIN
	const port = config.APP_PUBLIC_PORT ? `:${config.APP_PUBLIC_PORT}` : ''
	return `${config.APP_PROTOCOL}://${host}${port}`
}
