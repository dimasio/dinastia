// Строки интерфейса (скилл i18n). Namespace = модуль/область; ключи — <ns>:<раздел>.<ключ>.
import i18next, { type i18n } from 'i18next'
import auth from '../locales/ru/auth.json' with { type: 'json' }
import common from '../locales/ru/common.json' with { type: 'json' }
import errors from '../locales/ru/errors.json' with { type: 'json' }
import home from '../locales/ru/home.json' with { type: 'json' }
import nav from '../locales/ru/nav.json' with { type: 'json' }
import schools from '../locales/ru/schools.json' with { type: 'json' }
// gen:module:import

export const resources = {
	ru: {
		common,
		errors,
		auth,
		nav,
		home,
		schools,
		// gen:module:entry
	},
} as const
export const defaultNS = 'common'
export type Resources = (typeof resources)['ru']

export function createI18n(lng: 'ru' = 'ru'): i18n {
	const instance = i18next.createInstance()
	void instance.init({
		lng,
		fallbackLng: 'ru',
		resources,
		defaultNS,
		ns: Object.keys(resources.ru),
		interpolation: { escapeValue: false }, // React экранирует сам
		initAsync: false,
	})
	return instance
}

/** Код ошибки API → ключ namespace `errors` (скилл api-endpoints §3); неизвестный — общий текст. Вызов: t(key, { ns: 'errors' }). */
export type ErrorKey = keyof Resources['errors']
export function errorKey(code: string | undefined): ErrorKey {
	return code && code in resources.ru.errors ? (code as ErrorKey) : 'UNKNOWN'
}

const dateFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
export const formatDate = (d: Date | string, timeZone?: string) =>
	(timeZone
		? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone })
		: dateFmt
	).format(new Date(d))
