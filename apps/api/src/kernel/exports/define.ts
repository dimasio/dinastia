// Определение выгрузки таблицы (скилл documents): модуль объявляет `defineExport` в `modules/<m>/exports.ts` и список
// `exports` в `defineModule`; ядро ставит задачу, пишет xlsx в private-файл и отдаёт подписанную ссылку запросившему.
import type { z } from 'zod'
import type { Permission } from '../../permissions.ts'
import type { BaseCtx, SchoolCtx } from '../context.ts'

/** Тип колонки в файле: `percent` — целое 0–100, в файле — процент; даты — по Москве. */
export type ExportColumnType = 'text' | 'number' | 'percent' | 'date' | 'datetime'

export interface ExportColumn<R> {
	key: keyof R & string
	/** Ключ строки i18n заголовка: `learning:export.columns.name`. */
	title: string
	type?: ExportColumnType
	/** Значение — ключ перевода: в файле `t(\`${labels}.${value}\`)` (статусы словами, как на экране). */
	labels?: string
	/** Ширина в символах. */
	width?: number
}

export type ExportCell = string | number | Date | null

export interface ExportDef<I, P, R> {
	/** `<модуль>.<выгрузка>` (kebab-case), неизменяемо. */
	key: string
	/** Право на выгрузку; ядро проверяет его до `prepare`. */
	perm: Permission
	input: z.ZodType<I>
	/**
	 * В запросе сотрудника: проверить доступ к записи (курс, область куратора) и вернуть параметры задачи (JSON). Задача
	 * выполняется без пользователя — всё, что зависит от него, решается здесь.
	 */
	prepare: (ctx: SchoolCtx, input: I) => Promise<P>
	/** Имя файла без расширения (может содержать название курса). */
	fileName: (ctx: BaseCtx, params: P) => Promise<string> | string
	columns: ExportColumn<R>[]
	/** Строки пачками — не держать в памяти больше нужного; всего не больше `EXPORT_MAX_ROWS`. */
	rows: (ctx: BaseCtx, params: P) => AsyncIterable<R[]>
}

// biome-ignore lint/suspicious/noExplicitAny: у каждой выгрузки свои вход, параметры и строки
export type AnyExport = ExportDef<any, any, any>

export const EXPORT_KEY = /^[a-z][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/
export const EXPORT_MAX_ROWS = 100_000

export function defineExport<I, P, R extends Record<string, ExportCell>>(def: ExportDef<I, P, R>): ExportDef<I, P, R> {
	if (!EXPORT_KEY.test(def.key)) throw new Error(`выгрузка «${def.key}»: ключ — <модуль>.<выгрузка> в kebab-case`)
	if (!def.columns.length) throw new Error(`выгрузка «${def.key}»: нет колонок`)
	return def
}
