/// <reference types="vite/client" />
interface ImportMetaEnv {
	readonly VITE_APP_DOMAIN: string
	/** Сбор ошибок веба (5.4); пусто — выключено. */
	readonly VITE_SENTRY_DSN: string | undefined
	readonly VITE_APP_RELEASE: string
}
