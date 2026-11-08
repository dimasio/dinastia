// Общие части типов вопросов (карточка 3.2): обязательные тексты, баллы, детерминированный «перемешанный» порядок,
// разбор ответа и подстановки текстового ввода. Чистые функции — их используют и сервер (grade), и клиент.
import { CompactText, isEmptyDoc, RichText } from '@dinastia/contracts/common'
import { z } from 'zod'

/** Формулировка: пустая — ошибка схемы (`PROMPT_REQUIRED`, текст — `questions:errors.*`). */
export const PromptText = RichText.refine((d) => !isEmptyDoc(d), { message: 'PROMPT_REQUIRED' })

/** Текст варианта, элемента порядка или половины пары; пустой — ошибка схемы с кодом типа. */
export const requiredCompact = (code: 'OPTION_REQUIRED' | 'ITEM_REQUIRED') =>
	CompactText.refine((d) => !isEmptyDoc(d), { message: code })

export const Points = z.number().int().min(1).max(100)

export const SCORING = ['all_or_nothing', 'partial'] as const
export const Scoring = z.enum(SCORING)

/** Баллы с точностью до сотых (частичные баллы без «хвостов» плавающей точки). */
export const roundScore = (n: number) => Math.round(n * 100) / 100

/** Хэш строки для детерминированного порядка. */
function hash(s: string): number {
	let h = 5381
	for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
	return h >>> 0
}

/**
 * «Перемешанный» порядок, не зависящий от порядка хранения: так `toPublic` не раскрывает верный порядок элементов
 * (id у элементов случайные, порядок по ним не связан с верным). Сервер в 3.3 перемешивает ещё и по попытке.
 */
export function shuffled<T extends { id?: string | undefined }>(items: readonly T[]): T[] {
	return [...items].sort((a, b) => hash(a.id ?? '') - hash(b.id ?? '') || (a.id ?? '').localeCompare(b.id ?? ''))
}

/** Нормализация текстового ответа: пробелы по краям убраны, подряд идущие схлопнуты, `ё` = `е`, регистр — по настройке. */
export function normalizeText(s: string, caseSensitive: boolean): string {
	const t = s.trim().replace(/\s+/g, ' ').replaceAll('ё', 'е').replaceAll('Ё', 'Е')
	return caseSensitive ? t : t.toLowerCase()
}

/** Совпадение с шаблоном: `*` — любая последовательность символов (в том числе пустая), `?` — ровно один символ. Без регулярных выражений. */
export function matchesPattern(pattern: string, text: string): boolean {
	let p = 0
	let t = 0
	let star = -1
	let mark = 0
	while (t < text.length) {
		if (p < pattern.length && (pattern[p] === '?' || pattern[p] === text[t])) {
			p++
			t++
		} else if (p < pattern.length && pattern[p] === '*') {
			star = p++
			mark = t
		} else if (star !== -1) {
			p = star + 1
			t = ++mark
		} else return false
	}
	while (p < pattern.length && pattern[p] === '*') p++
	return p === pattern.length
}
