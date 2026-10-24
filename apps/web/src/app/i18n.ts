import { createI18n, type defaultNS, type Resources } from '@dinastia/i18n'

export const i18n = createI18n('ru')

declare module 'i18next' {
	interface CustomTypeOptions {
		defaultNS: typeof defaultNS
		resources: Resources
	}
}
