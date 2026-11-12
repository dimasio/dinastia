// Общее для генераторов (скилл core-kernel): вставка строк у маркеров `// gen:<вид>:<место>`, запись файлов, имена.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { root } from '../skills.ts'

export interface Change {
	file: string // от корня репозитория
	kind: 'create' | 'insert' | 'json'
	content: string
	marker?: string
	/** Для json: ключ, под который кладётся значение `content` (JSON); вложенный — через точку (`questions.values.type.x`). */
	key?: string
}

/** kebab-case → camelCase (`question-bank` → `questionBank`). */
export const camel = (kebab: string) => kebab.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase())

/** Строка с маркером — точное совпадение имени (`gen:module:permissions` не совпадает с `…:permissions-import`). */
function markerRe(marker: string): RegExp {
	const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	return new RegExp(`gen:${escaped}(?![\\w:-])`)
}

export function create(file: string, content: string): Change {
	return { file, kind: 'create', content }
}

export function insertBefore(file: string, marker: string, line: string): Change {
	return { file, kind: 'insert', marker, content: line }
}

/** Добавить раздел `key` в JSON-файл (строки i18n; вложенный — через точку); раздел уже есть — ошибка плана. */
export function jsonSection(file: string, key: string, value: unknown): Change {
	return { file, kind: 'json', key, content: JSON.stringify(value) }
}

/** Объект по пути ключей; нет такого раздела — undefined. */
function jsonAt(data: unknown, path: string[]): Record<string, unknown> | undefined {
	const node = path.reduce<unknown>((n, k) => (n as Record<string, unknown> | undefined)?.[k], data)
	return node && typeof node === 'object' ? (node as Record<string, unknown>) : undefined
}

/** Проверить все изменения до записи: новых файлов нет, маркеры есть, строки ещё не вставлены. */
export function plan(changes: Change[]): string[] {
	const problems: string[] = []
	for (const c of changes) {
		const path = join(root, c.file)
		if (c.kind === 'create' && existsSync(path)) problems.push(`уже существует: ${c.file}`)
		if (c.kind === 'insert') {
			if (!existsSync(path)) problems.push(`нет файла: ${c.file}`)
			else {
				const text = readFileSync(path, 'utf8')
				if (!markerRe(c.marker ?? '').test(text)) problems.push(`нет маркера gen:${c.marker} в ${c.file}`)
				if (text.includes(c.content.trim())) problems.push(`уже вставлено в ${c.file}: ${c.content.trim()}`)
			}
		}
		if (c.kind === 'json') {
			if (!existsSync(path)) problems.push(`нет файла: ${c.file}`)
			else {
				const parts = (c.key ?? '').split('.')
				const parent = jsonAt(JSON.parse(readFileSync(path, 'utf8')), parts.slice(0, -1))
				if (!parent) problems.push(`нет раздела «${parts.slice(0, -1).join('.')}» в ${c.file}`)
				else if ((parts.at(-1) ?? '') in parent) problems.push(`уже есть «${c.key}» в ${c.file}`)
			}
		}
	}
	return problems
}

/** Применить изменения; вставка — отдельной строкой перед маркером, с его отступом. */
export function apply(changes: Change[]): string[] {
	const touched = new Set<string>()
	for (const c of changes) {
		const path = join(root, c.file)
		if (c.kind === 'create') {
			mkdirSync(dirname(path), { recursive: true })
			writeFileSync(path, c.content)
		} else if (c.kind === 'json') {
			const data = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
			const parts = (c.key ?? '').split('.')
			const parent = jsonAt(data, parts.slice(0, -1)) as Record<string, unknown>
			parent[parts.at(-1) ?? ''] = JSON.parse(c.content)
			writeFileSync(path, `${JSON.stringify(data, null, '\t')}\n`)
		} else {
			const lines = readFileSync(path, 'utf8').split('\n')
			const re = markerRe(c.marker ?? '')
			const at = lines.findIndex((l) => re.test(l))
			const indent = lines[at]?.match(/^\s*/)?.[0] ?? ''
			lines.splice(at, 0, ...c.content.split('\n').map((l) => indent + l))
			writeFileSync(path, lines.join('\n'))
		}
		touched.add(relative(root, path))
	}
	return [...touched]
}
