// Сбор ошибок веба (5.4, скилл observability): ошибки рендера и необработанные исключения — в GlitchTip (свой экземпляр в РФ).
// Без `SENTRY_DSN_WEB` при сборке — выключено. SDK грузится лениво, вне начальной загрузки. Персональные данные не уходят: без
// адреса страницы (в нём токены приглашений и входа), пользователя и истории действий — только ошибка, стек и релиз.
import type { ErrorEvent } from '@sentry/react'

const dsn = import.meta.env.VITE_SENTRY_DSN
let sdk: Promise<typeof import('@sentry/react')> | null = null

const scrub = (event: ErrorEvent): ErrorEvent => {
	delete event.request
	delete event.user
	delete event.breadcrumbs
	delete event.extra
	return event
}

export function initErrorReporting() {
	if (!dsn || sdk) return
	sdk = import('@sentry/react').then((S) => {
		S.init({
			dsn,
			release: import.meta.env.VITE_APP_RELEASE,
			defaultIntegrations: false,
			integrations: [S.globalHandlersIntegration()],
			tracesSampleRate: 0,
			beforeSend: scrub,
		})
		return S
	})
}

/** Ошибка экрана (граница ошибок маршрутов); выключено — ничего. */
export function reportError(error: unknown) {
	void sdk?.then((S) => S.captureException(error))
}
