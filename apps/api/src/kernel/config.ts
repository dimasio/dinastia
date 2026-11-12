import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { apiRoot } from './paths.ts'

// Локально переменные берутся из корневого .env (скилл local-env); в CI и проде — из окружения.
const envFile = join(apiRoot, '../../.env')
if (existsSync(envFile)) process.loadEnvFile(envFile)

const Env = z
	.object({
		NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
		API_PORT: z.coerce.number().int().default(3000),
		DATABASE_URL: z.url(),
		DATABASE_URL_OWNER: z.url(),

		APP_DOMAIN: z.string().min(1),
		APP_PROTOCOL: z.enum(['http', 'https']).default('https'),
		APP_PUBLIC_PORT: z.string().default(''),

		AUTH_SECRET: z.string().min(32),
		TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
		/** Схема очереди задач pg-boss; в тестах — своя у каждого процесса (src/test/setup.ts). */
		BOSS_SCHEMA: z
			.string()
			.regex(/^[a-z_][a-z0-9_]*$/)
			.default('pgboss'),
		/**
		 * Попыток входа по паролю в минуту с одного IP (и запросов ссылки для входа — не меньше 3). Меняется только вне production
		 * (e2e: все входы с 127.0.0.1).
		 */
		AUTH_SIGN_IN_LIMIT: z.coerce.number().int().min(1).max(1000).default(5),

		/** Сбор ошибок — GlitchTip (Sentry-совместимый, свой экземпляр в РФ, 5.4); пусто — выключено (локально, тесты). */
		SENTRY_DSN: z.url().optional(),
		/** Версия сборки — в ошибках и метриках; задаёт конвейер (фаза 6). */
		APP_RELEASE: z.string().default('dev'),
		/** Порт метрик Prometheus (`/metrics`) — только внутренняя сеть; 0 — не поднимать (5.4). */
		METRICS_PORT: z.coerce.number().int().min(0).default(0),

		/** S3-совместимое хранилище (D-011; локально SeaweedFS, D-037). Endpoint должен открываться и из браузера. */
		S3_ENDPOINT: z.url(),
		S3_REGION: z.string().default('ru-central1'),
		S3_BUCKET: z.string().min(1),
		S3_ACCESS_KEY: z.string().min(1),
		S3_SECRET_KEY: z.string().min(1),
		S3_FORCE_PATH_STYLE: z
			.enum(['true', 'false'])
			.default('false')
			.transform((v) => v === 'true'),

		MAIL_TRANSPORT: z.enum(['smtp', 'memory']).default('smtp'),
		SMTP_HOST: z.string().default('localhost'),
		SMTP_PORT: z.coerce.number().int().default(1025),
		SMTP_FROM: z.string().min(1),

		/** Секрет подписи фейкового провайдера вебхуков (только вне production; скилл integrations). */
		WEBHOOK_FAKE_SECRET: z.string().min(16).default('fake-webhook-secret-local'),

		/** Провайдер видео (D-011): fake — без сети (только вне production); kinescope — токен и проект платформы. */
		VIDEO_PROVIDER: z.enum(['fake', 'kinescope']).default('fake'),
		KINESCOPE_TOKEN: z.string().min(1).optional(),
		KINESCOPE_PROJECT_ID: z.string().min(1).optional(),
	})
	.superRefine((env, ctx) => {
		if (env.VIDEO_PROVIDER === 'kinescope' && !(env.KINESCOPE_TOKEN && env.KINESCOPE_PROJECT_ID))
			ctx.addIssue({
				code: 'custom',
				message: 'VIDEO_PROVIDER=kinescope: нужны KINESCOPE_TOKEN и KINESCOPE_PROJECT_ID',
			})
		if (env.NODE_ENV === 'production' && env.VIDEO_PROVIDER === 'fake')
			ctx.addIssue({ code: 'custom', message: 'VIDEO_PROVIDER=fake недопустим в production' })
	})

export type Config = z.infer<typeof Env>

export const config: Config = Env.parse(process.env)

/** Origin корневого домена или школы: `<protocol>://[<slug>.]<APP_DOMAIN>[:<port>]`. */
export function appOrigin(slug?: string): string {
	const host = slug ? `${slug}.${config.APP_DOMAIN}` : config.APP_DOMAIN
	const port = config.APP_PUBLIC_PORT ? `:${config.APP_PUBLIC_PORT}` : ''
	return `${config.APP_PROTOCOL}://${host}${port}`
}
