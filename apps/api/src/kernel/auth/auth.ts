// better-auth (D-007): пользователи, сессии, email+пароль, magic link. Школы, участники, приглашения — наши (modules/schools).
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { magicLink } from 'better-auth/plugins'
import { appOrigin, config } from '../config.ts'
import { db } from '../db/client.ts'
import { sendMail } from '../mail/transport.ts'
import { accounts, rateLimits, sessions, users, verifications } from './schema.ts'

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
		schema: { user: users, session: sessions, account: accounts, verification: verifications, rateLimit: rateLimits },
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
	emailAndPassword: { enabled: true, minPasswordLength: 8, autoSignIn: true },
	plugins: [
		magicLink({
			expiresIn: 15 * 60,
			storeToken: 'hashed',
			sendMagicLink: async ({ email, url }) => {
				await sendMail({
					to: email,
					subject: 'Вход в Dinastia',
					text: `Чтобы войти, перейдите по ссылке (действует 15 минут):\n\n${url}\n\nЕсли вы не запрашивали вход, просто проигнорируйте это письмо.`,
				})
			},
		}),
	],
	rateLimit: {
		enabled: true,
		storage: 'database',
		window: 60,
		max: 100,
		customRules: {
			'/sign-in/email': { window: 60, max: config.NODE_ENV === 'production' ? 5 : config.AUTH_SIGN_IN_LIMIT },
			'/sign-up/email': { window: 60, max: 5 },
			'/sign-in/magic-link': { window: 60, max: 3 },
		},
	},
	telemetry: { enabled: false }, // 152-ФЗ, скилл dependencies: без телеметрии
})

export type Session = typeof auth.$Infer.Session
