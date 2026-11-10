// Строки, которые нужны экрану ресурса (`<ns>:<key>.…`) — для теста полноты переводов модуля.
import type { z } from 'zod'
import { fieldsFromSchema } from './fields.ts'
import type { FormDef, OptionDef, ResourceDef } from './types.ts'

/** Ключи без namespace, относительно `<key>.`; подписи значений с `labels` и необязательные строки не входят. */
// biome-ignore lint/suspicious/noExplicitAny: вход списка конкретного ресурса не важен
export function resourceKeys<Row extends { id: string }>(def: ResourceDef<Row, any>): string[] {
	const keys = new Set(['title', 'description', 'empty.title', 'empty.description'])
	if (def.create) for (const k of ['button', 'title', 'submit', 'success']) keys.add(`create.${k}`)
	const field = (name: string) => keys.add(`fields.${name}`)
	// подписи вариантов-объектов приходят из данных — строк для них нет
	const values = (name: string, options: readonly OptionDef[] | undefined, labels: string | undefined) => {
		if (!labels) for (const o of options ?? []) if (typeof o === 'string') keys.add(`values.${name}.${o}`)
	}
	for (const c of def.columns) field(c.field)
	for (const f of def.filters ?? []) {
		field(f.field)
		values(f.field, f.options, f.labels)
	}
	const forms: FormDef<z.ZodObject>[] = []
	if (def.create) forms.push(def.create)
	for (const a of def.actions ?? []) {
		for (const k of ['label', 'success', ...(a.form || a.confirm ? ['title', 'submit'] : [])])
			keys.add(`actions.${a.key}.${k}`)
		if (a.form) forms.push(a.form)
	}
	for (const form of forms)
		for (const f of fieldsFromSchema(form).flat()) {
			field(f.name)
			if (f.hint) keys.add(`hints.${f.name}`)
			if (f.widget === 'select') values(f.name, f.options, f.labels)
		}
	return [...keys].sort()
}
