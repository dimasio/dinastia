// Поля формы из zod-схемы (скилл admin-resource): тип контрола, обязательность, варианты enum.
import { type RichTextProfile, richTextRegistry } from '@dinastia/contracts/common'
import type { z } from 'zod'
import type { FieldOverride, FormDef, OptionDef, Widget } from './types.ts'

export interface FieldInfo {
	name: string
	widget: Widget
	required: boolean
	options?: readonly OptionDef[] | undefined
	/** Профиль редактора для `richtext` — из схемы поля. */
	richText?: RichTextProfile | undefined
	labels?: string | undefined
	hint: boolean
}

interface Def {
	type: string
	innerType?: z.ZodType
	in?: z.ZodType
	out?: z.ZodType
	format?: string
	entries?: Record<string, string>
}
const defOf = (s: z.ZodType) => (s as unknown as { _zod: { def: Def } })._zod.def

/**
 * Снять обёртки optional/default/nullable/pipe — до типа, который вводит человек. Формат строки (email) берётся
 * и с выхода pipe: `z.string().trim().pipe(z.email())`.
 */
function unwrap(schema: z.ZodType): { base: z.ZodType; optional: boolean; format?: string | undefined } {
	let s = schema
	let optional = false
	let format: string | undefined
	for (;;) {
		const def = defOf(s)
		if (def.type === 'optional' || def.type === 'default' || def.type === 'nullable') {
			optional = true
			s = def.innerType as z.ZodType
		} else if (def.type === 'pipe') {
			format ??= defOf(def.out as z.ZodType).format
			s = def.in as z.ZodType
		} else return { base: s, optional, format: def.format ?? format }
	}
}

function widgetOf(
	base: z.ZodType,
	format: string | undefined,
): { widget: Widget; options?: string[]; richText?: RichTextProfile } {
	const rich = richTextRegistry.get(base)
	if (rich) return { widget: 'richtext', richText: rich.richText }
	const def = defOf(base)
	if (def.type === 'enum') return { widget: 'select', options: Object.values(def.entries ?? {}) }
	if (def.type === 'boolean') return { widget: 'switch' }
	if (def.type === 'number') return { widget: 'number' }
	if (def.type === 'string' && format === 'email') return { widget: 'email' }
	return { widget: 'input' }
}

/** Поля формы в порядке `layout` (или схемы) с учётом переопределений `fields`. */
export function fieldsFromSchema(form: FormDef<z.ZodObject>): FieldInfo[][] {
	const shape = form.schema.shape as Record<string, z.ZodType>
	const rows = form.layout ?? Object.keys(shape).map((k) => [k])
	return rows.map((row) =>
		row.map((name) => {
			const schema = shape[name]
			if (!schema) throw new Error(`поля «${name}» нет в схеме формы`)
			const { base, optional, format } = unwrap(schema)
			const auto = widgetOf(base, format)
			const o = (form.fields as Record<string, FieldOverride<unknown>> | undefined)?.[name]
			return {
				name,
				widget: o?.widget ?? auto.widget,
				required: !optional,
				options: o?.options ?? auto.options,
				richText: auto.richText ?? (o?.widget === 'richtext' ? 'lesson' : undefined),
				labels: o?.labels,
				hint: o?.hint ?? false,
			}
		}),
	)
}
