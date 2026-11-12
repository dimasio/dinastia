// Отдельный контур e2e (скилл testing): своя база dinastia_e2e, свой Mailpit и свои порты — рабочая база и почта
// `pnpm dev` (localhost:5173) не засоряются, и e2e идут при запущенном dev. Переменные подменяют .env у API, веба и
// CLI-скриптов, которые сценарии запускают (create-school, ops-grant): process.loadEnvFile не перетирает заданные.
export const E2E_DOMAIN = 'dinastia.localhost'
export const E2E_WEB_PORT = 5174
export const E2E_API_PORT = 3100
export const E2E_MAILPIT = 'http://localhost:8026'

export const e2eEnv = {
	APP_DOMAIN: E2E_DOMAIN,
	APP_PUBLIC_PORT: String(E2E_WEB_PORT),
	WEB_PORT: String(E2E_WEB_PORT),
	API_PORT: String(E2E_API_PORT),
	DATABASE_URL: 'postgres://app_user:app_user@localhost:5432/dinastia_e2e',
	DATABASE_URL_OWNER: 'postgres://app_owner:app_owner@localhost:5432/dinastia_e2e',
	SMTP_PORT: '1026',
	// все входы набора — с 127.0.0.1; лимит по IP (5/мин) иначе роняет сценарии. В production не меняется.
	AUTH_SIGN_IN_LIMIT: '1000',
	// свой кэш зависимостей Vite: два dev-сервера в одном каталоге не делят node_modules/.vite
	VITE_CACHE_DIR: 'node_modules/.vite-e2e',
} as const

for (const [k, v] of Object.entries(e2eEnv)) process.env[k] = v
