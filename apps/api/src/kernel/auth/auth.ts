// better-auth (D-007): пользователи, сессии, email+пароль, magic link. Школы, участники, приглашения — наши (modules/schools).
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { magicLink, twoFactor } from 'better-auth/plugins'
import { eq } from 'drizzle-orm'
import { appOrigin, config } from '../config.ts'
import { db } from '../db/client.ts'
import { impersonation } from './impersonation.ts'
import { sendMagicLinkEmail } from './magic-link-email.tsx'
import { accounts, rateLimits, sessions, twoFactors, users, verifications } from './schema.ts'

const port = config.APP_PUBLIC_PORT ? `:${config.APP_PUBLIC_PORT}` : ''

export const auth = betterAuth({
	appName: 'Dinastia',
	basePath: '/api/auth',
	secret: config.AUTH_SECRET,
	baseURL: {
		allowedHosts: [`${config.APP_DOMAIN}${port}`, `*.${config.APP_DOMAIN}${port}`],
		protocol: config.APP_PROTOCOL,
		fallback: appOrigin(),
	},
	trustedOrigins: [appOrigin(), `${config.APP_PROTOCOL}://*.${config.APP_DOMAIN}${port}`],
	database: drizzleAdapter(db, {
		provider: 'pg',
		schema: {
			user: users,
			session: sessions,
			account: accounts,
			verification: verifications,
			rateLimit: rateLimits,
			twoFactor: twoFactors,
		},
	}),
	advanced: {
		database: { generateId: false }, // id генерирует БД: uuidv7()
		crossSubDomainCookies: { enabled: true, domain: config.APP_DOMAIN },
		useSecureCookies: config.APP_PROTOCOL === 'https',
		// Явно: иначе better-auth молча отключает проверку origin/CSRF при NODE_ENV=test, и тесты ничего не проверяют.
		disableOriginCheck: false,
		// IP для rate limit — только вычисленный ядром (app.ts, TRUST_PROXY_HOPS), не сырой X-Forwarded-For клиента.
		ipAddress: { ipAddressHeaders: ['x-dinastia-client-ip'] },
	},
	user: {
		additionalFields: { platformRole: { type: 'string', required: false, input: false } },
	},
	databaseHooks: {
		user: {
			create: {
				// вход по ссылке создаёт пользователя без имени — в списках, очереди проверки и сертификате оно пустое (4.8); как при
				// создании аккаунта администратором — часть почты до «@», ученик меняет его в профиле
				before: async (user) => ({
					data: { ...user, name: user.name?.trim() || user.email.split('@')[0] || user.email },
				}),
			},
		},
	},
	emailAndPassword: { enabled: true, minPasswordLength: 8, autoSignIn: true },
	plugins: [
		magicLink({
			expiresIn: 15 * 60,
			storeToken: 'hashed',
			sendMagicLink: async ({ email, url }) => {
				// оператор входит только паролем и кодом из приложения (5.6): ссылка обошла бы второй фактор
				if (await isOperator(email)) return
				await sendMagicLinkEmail(email, url)
			},
		}),
		// второй фактор — обязателен оператору (5.6); остальным не предлагается
		twoFactor({ issuer: 'Dinastia', skipVerificationOnEnable: false }),
		// вход оператора от имени участника школы (5.6г)
		impersonation(),
	],
	rateLimit: {
		enabled: true,
		storage: 'database',
		window: 60,
		max: 100,
		customRules: {
			'/sign-in/email': { window: 60, max: config.NODE_ENV === 'production' ? 5 : config.AUTH_SIGN_IN_LIMIT },
			'/sign-up/email': { window: 60, max: 5 },
			// e2e: приглашения и демо входят по ссылке с одного 127.0.0.1 (D-044, 4.8)
			'/sign-in/magic-link': {
				window: 60,
				max: config.NODE_ENV === 'production' ? 3 : Math.max(3, config.AUTH_SIGN_IN_LIMIT),
			},
		},
	},
	telemetry: { enabled: false }, // 152-ФЗ, скилл dependencies: без телеметрии
})

export type Session = typeof auth.$Infer.Session

async function isOperator(email: string) {
	const [row] = await db
		.select({ role: users.platformRole })
		.from(users)
		.where(eq(users.email, email.toLowerCase()))
		.limit(1)
	return row?.role === 'operator'
}
