// Вид поля настройки для экрана /admin/settings — из zod-схемы поля (JSON Schema): контрол, варианты, длина.
import type { MemberRole } from '@dinastia/contracts/schools'
import type { SettingField as SettingFieldView } from '@dinastia/contracts/settings'
import { z } from 'zod'
import { type AnySettingsDef, isFlag, type SettingField } from './settings.ts'

type Json = { type?: string; const?: unknown; format?: string; enum?: unknown[]; maxLength?: number; anyOf?: Json[] }

function kindOf(field: SettingField<unknown>) {
	const root = z.toJSONSchema(field.schema, { io: 'input', unrepresentable: 'any' }) as Json
	const variants = root.anyOf ?? [root]
	// `''` рядом с форматом — «необязательная строка»
	const optional = variants.some((v) => v.const === '')
	const main = variants.find((v) => v.const !== '') ?? root
	const base = { optional, ...(main.maxLength ? { maxLength: main.maxLength } : {}) }
	if (main.enum) return { kind: 'select' as const, options: main.enum.map(String), ...base }
	if (main.type === 'boolean') return { kind: 'boolean' as const, ...base }
	if (main.type === 'integer' || main.type === 'number') return { kind: 'number' as const, ...base }
	if (main.format === 'email') return { kind: 'email' as const, ...base }
	if (main.format === 'uri') return { kind: 'url' as const, ...base }
	return { kind: 'text' as const, ...base }
}

export function settingsView(
	def: AnySettingsDef,
	values: Record<string, unknown>,
	role: MemberRole | 'operator',
	opts: { flags: boolean },
): SettingFieldView[] {
	return Object.entries(def.fields as Record<string, SettingField<unknown>>)
		.filter(([, field]) => isFlag(field) === opts.flags)
		.map(([name, field]) => ({
			module: def.module,
			name,
			group: field.group,
			...kindOf(field),
			value: (values[name] ?? null) as SettingFieldView['value'],
			editable: role === 'operator' ? isFlag(field) : role === 'owner' || field.edit.includes(role),
		}))
}
