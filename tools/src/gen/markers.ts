// Общее для генераторов (скилл core-kernel): вставка строк у маркеров `// gen:<вид>:<место>`, запись файлов, имена.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { root } from '../skills.ts'

export interface Change {
	file: string // от корня репозитория
	kind: 'create' | 'insert'
	content: string
	marker?: string
}

/** kebab-case → camelCase (`question-bank` → `questionBank`). */
export const camel = (kebab: string) => kebab.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase())

export function create(file: string, content: string): Change {
	return { file, kind: 'create', content }
}

export function insertBefore(file: string, marker: string, line: string): Change {
	return { file, kind: 'insert', marker, content: line }
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
				if (!text.includes(`gen:${c.marker}`)) problems.push(`нет маркера gen:${c.marker} в ${c.file}`)
				if (text.includes(c.content.trim())) problems.push(`уже вставлено в ${c.file}: ${c.content.trim()}`)
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
		} else {
			const lines = readFileSync(path, 'utf8').split('\n')
			const at = lines.findIndex((l) => l.includes(`gen:${c.marker}`))
			const indent = lines[at]?.match(/^\s*/)?.[0] ?? ''
			lines.splice(at, 0, ...c.content.split('\n').map((l) => indent + l))
			writeFileSync(path, lines.join('\n'))
		}
		touched.add(relative(root, path))
	}
	return [...touched]
}
