// Сбор ошибок (5.4, скилл observability): необработанные исключения процедур и задач — в GlitchTip (Sentry SDK, свой экземпляр в
// РФ). Без `SENTRY_DSN` выключено. Ожидаемые ошибки (`fail.*`, валидация, права) не отправляются. Персональные данные не уходят:
// без тел и заголовков запросов, cookie, пользователя и IP — только теги (школа, процедура или задача, релиз) и стек.
import * as Sentry from '@sentry/node'
import { config } from './config.ts'

let enabled = false

/** Только поля, которые нужны для разбора: исключение, теги, релиз; остальное из события вырезается. */
export function scrub(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
	delete event.request
	delete event.user
	delete event.breadcrumbs
	delete event.extra
	delete event.contexts?.culture
	if (event.server_name) delete event.server_name
	return event
}

export function initErrorReporting(
	service: 'api' | 'worker',
	opts: { dsn?: string; transport?: Sentry.NodeOptions['transport'] } = {},
) {
	const dsn = opts.dsn ?? config.SENTRY_DSN
	// `pnpm dev` поднимает API и воркер в одном процессе — инициализация одна
	if (!dsn || enabled) return
	Sentry.init({
		dsn,
		release: config.APP_RELEASE,
		environment: config.NODE_ENV,
		serverName: service,
		// без трассировки и автоинструментации: только ошибки, которые отправляем сами, и падение процесса
		tracesSampleRate: 0,
		defaultIntegrations: false,
		integrations: [Sentry.onUncaughtExceptionIntegration(), Sentry.onUnhandledRejectionIntegration()],
		beforeSend: scrub,
		...(opts.transport ? { transport: opts.transport } : {}),
	})
	Sentry.setTag('service', service)
	enabled = true
}

/** Отправить неожиданную ошибку с тегами; выключено — ничего. */
export function reportError(error: unknown, tags: Record<string, string | undefined>) {
	if (!enabled) return
	Sentry.withScope((scope) => {
		for (const [k, v] of Object.entries(tags)) if (v) scope.setTag(k, v)
		Sentry.captureException(error)
	})
}

/** Дождаться отправки (остановка процесса, тест). */
export async function flushErrors(timeoutMs = 2000) {
	if (enabled) await Sentry.flush(timeoutMs)
}
