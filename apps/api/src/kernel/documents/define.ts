// Документы PDF (скилл documents, D-013): модуль объявляет `defineDocument` — данные (zod), React-шаблон без клиентских хуков и
// ориентацию страницы; ядро собирает HTML со встроенными шрифтами и печатает его Chromium в фоновой задаче (`renderPdf`).
import type { ReactElement } from 'react'
import type { z } from 'zod'

export type PageOrientation = 'portrait' | 'landscape'

export interface DocumentDef<D> {
	/** `<модуль>.<документ>` (kebab-case), неизменяемо. */
	key: string
	schema: z.ZodType<D>
	/** Лист A4; ориентация может зависеть от данных (шаблон школы). */
	orientation: (data: D) => PageOrientation
	/**
	 * Разметка страницы: стили — инлайн или `<style>`, шрифты — `PT Serif` и `PT Sans` (кириллица встроена), картинки — только
	 * `data:` URI (сеть в браузере отключена). Предпросмотр в браузере — тот же HTML (`documentHtml`).
	 */
	render: (data: D) => ReactElement
	/** Пример данных — для предпросмотра и теста рендера. */
	example: D
}

export const DOCUMENT_KEY = /^[a-z][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/

export function defineDocument<D>(def: DocumentDef<D>): DocumentDef<D> {
	if (!DOCUMENT_KEY.test(def.key)) throw new Error(`документ «${def.key}»: ключ — <модуль>.<документ> в kebab-case`)
	return def
}
