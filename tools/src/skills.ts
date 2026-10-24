import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
export const skillsDir = join(root, 'docs/skills')

export interface Skill {
	name: string
	description: string
	dir: string // путь папки скилла от корня репозитория
	file: string
}

function walk(dir: string): string[] {
	return readdirSync(dir).flatMap((entry) => {
		if (entry.startsWith('_')) return []
		const path = join(dir, entry)
		if (statSync(path).isDirectory()) return walk(path)
		return entry === 'SKILL.md' ? [path] : []
	})
}

export function readSkills(): Skill[] {
	return walk(skillsDir)
		.sort()
		.map((file) => {
			const { data } = matter(readFileSync(file, 'utf8'))
			return {
				name: String(data.name ?? ''),
				description: String(data.description ?? ''),
				dir: relative(root, dirname(file)),
				file: relative(root, file),
			}
		})
}
