import { jsonb } from 'drizzle-orm/pg-core'

/** Документ Tiptap/ProseMirror (скилл rich-text). Схему документа проверяет контракт, не БД. */
export interface RichTextDoc {
	type: 'doc'
	content?: unknown[]
}

/** Тело форматированного текста — единственный документный тип в строке (D-032). */
export const richText = (name: string) => jsonb(name).$type<RichTextDoc>()

/** Непрозрачные данные, внутрь которых БД не заглядывает: diff журнала, payload outbox/вебхуков (D-032). */
export const opaqueJson = <T = unknown>(name: string) => jsonb(name).$type<T>()
