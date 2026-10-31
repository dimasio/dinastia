import { createI18n, type defaultNS, type Resources } from '@dinastia/i18n'

// в разработке и e2e пропущенный ключ виден как ⟦ключ⟧ — его ловит shoot() в tests/e2e/shots.ts
export const i18n = createI18n('ru', { markMissing: import.meta.env.DEV })

declare module 'i18next' {
	interface CustomTypeOptions {
		defaultNS: typeof defaultNS
		resources: Resources
	}
}
