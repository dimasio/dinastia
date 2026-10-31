// pnpm check:registries (пункт 1.5, скилл core-kernel): реестры собираются, схемы = таблицы, секреты не уходят
// ученику, jsonb только через хелперы, RLS у тенантных таблиц, ПДн помечены, у кодов ошибок есть тексты.
// Входит в pnpm check. Код возврата 1 — есть нарушения (список с местом и причиной).
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resources } from '@dinastia/i18n'
import { GLOBAL_TABLES_WITH_SCHOOL_REF } from './kernel/db/rls-coverage.ts'
import {
	blockIssues,
	errorCodeIssues,
	type Issue,
	questionIssues,
	tableIssues,
	tablesOf,
} from './kernel/registry-check.ts'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const issues: Issue[] = []

/** Импорт реестра: ошибка объявления (define*) — в отчёт с причиной, проверка идёт дальше. */
async function load<T>(where: string, fn: () => Promise<T>): Promise<T | null> {
	try {
		return await fn()
	} catch (e) {
		issues.push({ area: 'registry', where, message: e instanceof Error ? e.message : String(e) })
		return null
	}
}

function sources(dir: string): { path: string; source: string }[] {
	const out: { path: string; source: string }[] = []
	for (const entry of readdirSync(join(root, dir), { withFileTypes: true, recursive: true })) {
		if (!entry.isFile() || !/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) continue
		const full = join(entry.parentPath, entry.name)
		if (full.includes(`${join(root, 'apps/api/src/test')}`)) continue
		out.push({ path: relative(root, full), source: readFileSync(full, 'utf8') })
	}
	return out
}

await load('apps/api/src/modules/index.ts (модули, задачи, письма, файлы, вебхуки)', () => import('./modules/index.ts'))
const schema = await load('apps/api/src/db-schema.ts', () => import('./db-schema.ts'))
if (schema) issues.push(...tableIssues(tablesOf(schema), GLOBAL_TABLES_WITH_SCHOOL_REF))
const blocks = await load('@dinastia/blocks', () => import('@dinastia/blocks/server'))
if (blocks) issues.push(...blockIssues(blocks.blockStorages, resources.ru.blocks))
const questions = await load('@dinastia/questions', () => import('@dinastia/questions'))
if (questions) issues.push(...questionIssues(questions.questionTypes, resources.ru.questions))
issues.push(...errorCodeIssues([...sources('apps/api/src'), ...sources('packages/contracts/src')], resources.ru.errors))

if (!issues.length) {
	console.log('check:registries — ok')
	process.exit(0)
}
const areas = [...new Set(issues.map((i) => i.area))]
for (const area of areas) {
	console.error(`\n${area}:`)
	for (const i of issues.filter((x) => x.area === area)) console.error(`  ✗ ${i.where} — ${i.message}`)
}
console.error(`\ncheck:registries — нарушений: ${issues.length} (скилл core-kernel, «check:registries»)`)
process.exit(1)
