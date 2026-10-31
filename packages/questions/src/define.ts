// Реестр типов вопросов (скилл question-types, D-035): defineQuestion — контракт типа. Хранение в общих таблицах
// questions/question_items, ревизии и проверку делает ядро (apps/api/src/kernel/questions) по этому контракту.
import { hasPath } from '@dinastia/contracts/common'
import type { z } from 'zod'

/** Поля любого вопроса — общие колонки questions. */
export const COMMON_FIELDS = ['prompt', 'explanation', 'points'] as const
/** Колонки questions, которые тип берёт по `uses.columns`; остальные ядро держит в значениях по умолчанию. */
export const TYPE_COLUMNS = ['scoring', 'caseSensitive', 'numberAnswer', 'numberTolerance'] as const
export type TypeColumn = (typeof TYPE_COLUMNS)[number]

/** Вид элемента → его поля (колонки question_items); у элемента в API ещё `id`. */
export const ITEM_FIELDS = {
	option: ['body', 'isCorrect'],
	order_item: ['body', 'correctPosition'],
	match_left: ['body', 'matchKey'],
	match_right: ['body', 'matchKey'],
	accepted_text: ['text'],
} as const
export type ItemKind = keyof typeof ITEM_FIELDS

export interface QuestionGrade {
	/** Баллы ∈ [0, max]. */
	score: number
	max: number
	isCorrect: boolean
}

export interface QuestionDef<
	T extends string = string,
	S extends z.ZodObject = z.ZodObject,
	P = z.output<S>,
	R = unknown,
	V = unknown,
> {
	/** `snake_case`, неизменяем после релиза: значение `questions.type`. */
	type: T
	/** Какие колонки questions и виды элементов использует тип — чужие ядро не пишет. */
	uses: { columns: readonly TypeColumn[]; items: readonly ItemKind[] }
	/** Данные вопроса в банке: общие поля + `uses.columns` + поля-массивы элементов из `items`. */
	schema: S
	/** Поле-массив схемы → вид элемента (`options` → `option`). */
	items?: Readonly<Record<string, ItemKind>>
	/** Заготовка нового вопроса в редакторе (может не проходить схему: вариантов ещё нет). */
	defaults: () => unknown
	/** Пример готового вопроса — проходит схему; по нему проверяются toPublic, grade, генератор и тесты. */
	example: () => z.output<S>
	/** Пути к секретам (`options.*.isCorrect`, `explanation`): ученику в попытке — только через toPublic. */
	secretKeys: readonly string[]
	toPublic: (data: z.output<S>) => P
	/** Ответ ученика. */
	responseSchema: z.ZodType<R>
	/** Чистая детерминированная проверка, только на сервере. Не нужна при `manual`. */
	grade?: (data: z.output<S>, response: R) => QuestionGrade
	/** Ручная проверка (open_text): ответ ждёт проверяющего. */
	manual?: boolean
	/** Разбор: верный ответ и пояснение — по правилу show_correct блока quiz. */
	review: (data: z.output<S>) => V
	/** Перемешивать элементы при снимке попытки. */
	shuffle: 'items' | false
}

// biome-ignore lint/suspicious/noExplicitAny: у каждого типа своя схема — для реестров
export type AnyQuestionDef = QuestionDef<string, any, any, any, any>
export type QuestionData<Q extends AnyQuestionDef> = z.output<Q['schema']>
export type QuestionPublicData<Q extends AnyQuestionDef> = ReturnType<Q['toPublic']>
export type QuestionResponse<Q extends AnyQuestionDef> = z.output<Q['responseSchema']>
export type QuestionReview<Q extends AnyQuestionDef> = ReturnType<Q['review']>

export const QUESTION_TYPE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/

interface Def {
	type: string
	innerType?: z.ZodType
	element?: z.ZodType
	shape?: Record<string, z.ZodType>
	in?: z.ZodType
}
const defOf = (s: z.ZodType) => (s as unknown as { _zod: { def: Def } })._zod.def
function unwrap(s: z.ZodType): z.ZodType {
	let cur = s
	for (;;) {
		const d = defOf(cur)
		if (['optional', 'nullable', 'default'].includes(d.type)) cur = d.innerType as z.ZodType
		else if (d.type === 'pipe') cur = d.in as z.ZodType
		else return cur
	}
}

/** Поля элемента в схеме (для сверки с колонками вида). */
export function itemShapeKeys(schema: z.ZodObject, field: string): string[] | null {
	const arr = defOf(unwrap((schema.shape as Record<string, z.ZodType>)[field] as z.ZodType))
	if (arr.type !== 'array') return null
	const el = defOf(unwrap(arr.element as z.ZodType))
	return el.type === 'object' && el.shape ? Object.keys(el.shape) : null
}

/** Расхождения схемы типа с общими таблицами (основа check:registries, пункт 1.5). */
export function questionDefIssues(def: AnyQuestionDef): string[] {
	const issues: string[] = []
	const shape = Object.keys(def.schema.shape as Record<string, unknown>)
	const items = def.items ?? {}
	for (const f of COMMON_FIELDS) if (!shape.includes(f)) issues.push(`нет общего поля ${f}`)
	for (const c of def.uses.columns) if (!shape.includes(c)) issues.push(`uses.columns: ${c} нет в схеме`)
	for (const f of shape) {
		const known =
			(COMMON_FIELDS as readonly string[]).includes(f) ||
			(def.uses.columns as readonly string[]).includes(f) ||
			f in items
		if (!known)
			issues.push(
				(TYPE_COLUMNS as readonly string[]).includes(f)
					? `поле ${f} — колонка типа, а её нет в uses.columns`
					: `поле ${f} не колонка questions и не элементы`,
			)
	}
	for (const [field, kind] of Object.entries(items)) {
		if (!def.uses.items.includes(kind)) issues.push(`items.${field}: вид ${kind} нет в uses.items`)
		const keys = itemShapeKeys(def.schema, field)
		if (!keys) {
			issues.push(`items.${field}: в схеме должен быть массив объектов`)
			continue
		}
		const allowed = ['id', ...ITEM_FIELDS[kind]]
		for (const k of keys) if (!allowed.includes(k)) issues.push(`items.${field}: поле ${k} не колонка вида ${kind}`)
	}
	for (const kind of def.uses.items)
		if (!Object.values(items).includes(kind)) issues.push(`uses.items: ${kind} без поля в items`)
	return issues
}

type Input<T extends string, S extends z.ZodObject, P, R, V> = QuestionDef<T, S, P, R, V>

export function defineQuestion<const T extends string, S extends z.ZodObject, P, R, V>(
	def: Input<T, S, P, R, V>,
): QuestionDef<T, S, P, R, V> {
	if (!QUESTION_TYPE.test(def.type) || def.type.length > 40) throw new Error(`вопрос «${def.type}»: тип — snake_case`)
	if (!def.manual && !def.grade) throw new Error(`вопрос «${def.type}»: нужен grade (или manual: true)`)
	const issues = questionDefIssues(def as AnyQuestionDef)
	if (issues.length) throw new Error(`вопрос «${def.type}»: ${issues.join('; ')}`)
	const parsed = def.schema.safeParse(def.example())
	if (!parsed.success) throw new Error(`вопрос «${def.type}»: example() не проходит schema — ${parsed.error.message}`)
	const pub = def.toPublic(parsed.data)
	for (const path of def.secretKeys)
		if (hasPath(pub, path)) throw new Error(`вопрос «${def.type}»: toPublic не убирает ${path}`)
	return def
}
