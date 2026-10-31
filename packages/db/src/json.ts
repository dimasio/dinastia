import type { Column } from 'drizzle-orm'
import { jsonb } from 'drizzle-orm/pg-core'

/** Документ Tiptap/ProseMirror (скилл rich-text). Схему документа проверяет контракт, не БД. */
export interface RichTextDoc {
	type: 'doc'
	content?: unknown[]
}

const JSON_KIND = 'dinastiaJson'
type JsonKind = 'richText' | 'opaque'

function mark<B>(builder: B, kind: JsonKind): B {
	;(builder as unknown as { config: Record<string, unknown> }).config[JSON_KIND] = kind
	return builder
}

/** Тело форматированного текста — единственный документный тип в строке (D-032). */
export const richText = (name: string) => mark(jsonb(name).$type<RichTextDoc>(), 'richText')

/** Непрозрачные данные, внутрь которых БД не заглядывает: diff журнала, payload outbox/вебхуков (D-032). */
export const opaqueJson = <T = unknown>(name: string) => mark(jsonb(name).$type<T>(), 'opaque')

/** Откуда jsonb-колонка: `richText`/`opaque` — из хелперов; null — голый jsonb() (check:registries, D-032). */
export const jsonKind = (column: Column): JsonKind | null =>
	((column as unknown as { config: Record<string, unknown> }).config[JSON_KIND] as JsonKind | undefined) ?? null
