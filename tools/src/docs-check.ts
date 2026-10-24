// pnpm docs:check — шапки скиллов и спек, уникальность имён, таблица скиллов в AGENTS.md, ссылки .claude/skills,
// относительные ссылки в markdown.
import { existsSync, readdirSync, readFileSync, readlinkSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import matter from 'gray-matter'
import { readSkills, root } from './skills.ts'

const errors: string[] = []
const fail = (msg: string) => errors.push(msg)

// Скиллы
const skills = readSkills()
const names = new Map<string, string>()
for (const s of skills) {
	if (!s.name) fail(`${s.file}: нет name`)
	if (!s.description) fail(`${s.file}: нет description`)
	const expected = s.dir
		.replace(/^docs\/skills\/(workflow|product|platform|core)\//, (_, level: string) =>
			level === 'core' ? 'core-' : '',
		)
		.replaceAll('/', '-')
	if (s.name && s.name !== expected) fail(`${s.file}: name "${s.name}", по пути ожидается "${expected}"`)
	const prev = names.get(s.name)
	if (prev) fail(`дубль имени ${s.name}: ${prev}, ${s.file}`)
	names.set(s.name, s.file)
}

// AGENTS.md ↔ скиллы
const agents = readFileSync(join(root, 'AGENTS.md'), 'utf8')
const listed = new Set([...agents.matchAll(/\|\s*`([a-z0-9-]+)`\s*\|\s*$/gm)].map((m) => m[1]))
for (const name of names.keys()) if (!listed.has(name)) fail(`AGENTS.md: нет строки скилла ${name}`)
for (const name of listed) if (name && !names.has(name)) fail(`AGENTS.md: скилл ${name} не найден в docs/skills`)

// .claude/skills
for (const s of skills) {
	const link = join(root, '.claude/skills', s.name)
	if (!existsSync(link)) {
		fail(`.claude/skills/${s.name}: нет ссылки — pnpm skills:link`)
		continue
	}
	const target = resolve(dirname(link), readlinkSync(link))
	if (relative(root, target) !== s.dir) fail(`.claude/skills/${s.name}: ведёт не в ${s.dir}`)
}

// Шапки спек и задач
function mdFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((e) => {
		const p = join(dir, e)
		return statSync(p).isDirectory() ? mdFiles(p) : e.endsWith('.md') ? [p] : []
	})
}
const specStatuses = ['draft', 'current', 'outdated']
for (const file of mdFiles(join(root, 'docs/specs'))) {
	if (file.endsWith('README.md')) continue
	const { data } = matter(readFileSync(file, 'utf8'))
	if (!specStatuses.includes(String(data.status))) fail(`${relative(root, file)}: status ∉ ${specStatuses.join('|')}`)
}
const taskStatuses = ['backlog', 'active', 'review', 'done', 'dropped']
for (const file of mdFiles(join(root, 'docs/tasks')).filter((f) => f.endsWith('/task.md'))) {
	const { data } = matter(readFileSync(file, 'utf8'))
	if (!taskStatuses.includes(String(data.status))) fail(`${relative(root, file)}: status ∉ ${taskStatuses.join('|')}`)
}

// Относительные ссылки
for (const file of [...mdFiles(join(root, 'docs')), join(root, 'AGENTS.md'), join(root, 'README.md')]) {
	const text = readFileSync(file, 'utf8').replace(/```[\s\S]*?```/g, '')
	for (const [, href] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
		if (!href || /^(https?:|mailto:|#)/.test(href)) continue
		const target = resolve(dirname(file), href.split('#')[0] ?? '')
		if (!existsSync(target)) fail(`${relative(root, file)}: битая ссылка ${href}`)
	}
}

if (errors.length) {
	for (const e of errors) console.error(`✗ ${e}`)
	console.error(`docs:check — ошибок: ${errors.length}`)
	process.exit(1)
}
console.log(`docs:check — ok (скиллов: ${skills.length})`)
