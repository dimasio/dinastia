// Окружение ресурсов: кто смотрит и как показать ошибку API. Ставится один раз в лэйауте области (скилл admin-resource).
import { createContext, type ReactNode, useContext, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { Viewer } from './types.ts'

interface ResourceEnv {
	viewer: Viewer
	/** Ошибка API → текст для человека (коды — namespace errors). */
	errorText: (error: unknown) => string
}

const Ctx = createContext<ResourceEnv | null>(null)

export function ResourceProvider({ children, ...env }: ResourceEnv & { children: ReactNode }) {
	return <Ctx.Provider value={env}>{children}</Ctx.Provider>
}

export function useResourceEnv(): ResourceEnv {
	const env = useContext(Ctx)
	if (!env) throw new Error('ResourcePage вне ResourceProvider')
	return env
}

/** Права роли приходят списком из `schools.me` (у владельца — все). */
export const can = (viewer: Viewer, perm: string | undefined) => !perm || viewer.permissions.includes(perm)

type T = (key: string, options?: Record<string, unknown>) => string

/**
 * Строки ресурса: `r('title')` → `<ns>:<key>.title`. Ключи собираются из описания ресурса, поэтому t без
 * типизации ключей; полноту строк проверяет тест по `resourceKeys()`.
 */
export function useResourceT(ns: string, key: string) {
	const { t: raw, i18n } = useTranslation()
	// Стабильные функции — колонки таблицы пересобираются только при смене языка.
	return useMemo(() => {
		const t = raw as unknown as T
		const r: T = (k, o) => t(`${ns}:${key}.${k}`, o)
		/** Подпись значения: `labels` (`common:roles`) или `<ns>:<key>.values.<field>`; нет строки — само значение. */
		const value = (field: string, v: unknown, labels?: string) =>
			v === null || v === undefined || v === ''
				? '—'
				: t(`${labels ?? `${ns}:${key}.values.${field}`}.${String(v)}`, { defaultValue: String(v) })
		return { t, r, value, lang: i18n.language }
	}, [raw, i18n.language, ns, key])
}
