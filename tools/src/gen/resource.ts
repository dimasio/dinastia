// pnpm gen:resource <модуль> <ресурс> --row <Схема> [--api <namespace>] [--perm <право>] [--title "Название"] [--dry-run]
// Заготовка экрана-реестра (скилл admin-resource): ресурс, маршрут /admin/<ресурс>, строки i18n, запись в реестре.
// Колонки — из zod-схемы строки в packages/contracts/src/<модуль>.ts; процедура списка — client.<api>.list.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { root } from '../skills.ts'
import { apply, camel, create, insertBefore, jsonSection, plan } from './markers.ts'

const args = process.argv.slice(2)
const opt = (name: string) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : undefined)
const positional = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.match(/^--(row|api|perm|title)$/))
const [mod, name] = positional
const row = opt('row')
const dryRun = args.includes('--dry-run')
const kebab = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/

if (!mod || !name || !row || !kebab.test(mod) || !kebab.test(name) || !/^[A-Z][A-Za-z0-9]*$/.test(row)) {
	console.error(
		'Использование: pnpm gen:resource <модуль> <ресурс-kebab> --row <СхемаСтроки> [--api <namespace>] [--perm <право>] [--title "Название"] [--dry-run]',
	)
	process.exit(1)
}

const c = camel(name)
const api = opt('api') ?? c
const perm = opt('perm') ?? `${mod}.access`
const title = opt('title') ?? name
const contractFile = join(root, `packages/contracts/src/${mod}.ts`)
const localeFile = `packages/i18n/locales/ru/${mod}.json`

const problems: string[] = []
if (!existsSync(contractFile)) problems.push(`нет контракта модуля: packages/contracts/src/${mod}.ts`)
if (!existsSync(join(root, localeFile)))
	problems.push(`нет строк модуля: ${localeFile} (сначала pnpm gen:module ${mod})`)
if (problems.length) {
	for (const p of problems) console.error(`✗ ${p}`)
	process.exit(1)
}

// Схема строки и процедура списка — из настоящего контракта, а не догадкой.
type Def = { type: string; innerType?: unknown; in?: unknown }
type Schema = { _zod: { def: Def }; shape?: Record<string, Schema> }
const contracts = (await import(pathToFileURL(contractFile).href)) as Record<string, unknown>
const schema = contracts[row] as Schema | undefined
if (!schema?.shape) {
	console.error(`✗ в packages/contracts/src/${mod}.ts нет z.object «${row}»`)
	process.exit(1)
}
const index = readFileSync(join(root, 'packages/contracts/src/index.ts'), 'utf8')
if (!new RegExp(`^\\s*${api}:`, 'm').test(index))
	problems.push(`в packages/contracts/src/index.ts нет namespace «${api}» (укажите --api)`)
if (!schema.shape.id) problems.push(`у «${row}» нет поля id`)

function baseType(s: Schema): string {
	const def = s._zod.def
	if (def.type === 'optional' || def.type === 'nullable' || def.type === 'default')
		return baseType(def.innerType as Schema)
	if (def.type === 'pipe') return baseType(def.in as Schema)
	return def.type
}
const RENDER: Record<string, string> = { enum: 'badge', date: 'date', boolean: 'bool', number: 'number' }
const fields = Object.entries(schema.shape).filter(([k]) => k !== 'id' && !/Id$/.test(k))
const columns = fields.map(([k, s]) => {
	const render = RENDER[baseType(s)]
	return `\t\t{ field: '${k}'${render ? `, render: '${render}'` : ''} },`
})

const routeDir = `apps/web/src/routes/admin/${name}`
const changes = [
	create(
		`apps/web/src/features/${mod}/resources/${name}.ts`,
		`// ${title} (скилл admin-resource): колонки, поиск, фильтры, форма создания, действия.
import { ${row} } from '@dinastia/contracts/${mod}'
import { defineResource } from '@dinastia/ui/resource'
import { client } from '#/app/orpc.ts'

export const ${c}Resource = defineResource({
	key: '${name}',
	ns: '${mod}',
	row: ${row},
	list: client.${api}.list,
	perms: { read: '${perm}' },
	columns: [
${columns.join('\n')}
	],
})
`,
	),
	create(
		`${routeDir}/index.tsx`,
		`import { ResourcePage, resourceSearch } from '@dinastia/ui/resource'
import { createFileRoute } from '@tanstack/react-router'
import { requirePerm } from '#/app/guards.ts'
import { ${c}Resource } from '#/features/${mod}/resources/${name}.ts'

export const Route = createFileRoute('/admin/${name}/')({
	validateSearch: resourceSearch,
	beforeLoad: requirePerm(${c}Resource.perms.read),
	component: () => {
		const search = Route.useSearch()
		const navigate = Route.useNavigate()
		return <ResourcePage resource={${c}Resource} search={search} onSearch={(s) => navigate({ search: s, replace: true })} />
	},
})
`,
	),
	insertBefore(
		'apps/web/src/features/resources.ts',
		'resource:import',
		`import { ${c}Resource } from './${mod}/resources/${name}.ts'`,
	),
	insertBefore('apps/web/src/features/resources.ts', 'resource:entry', `${c}Resource,`),
	jsonSection(localeFile, name, {
		title,
		description: `${title}: описание экрана`,
		fields: Object.fromEntries(fields.map(([k]) => [k, k])),
		empty: { title: `${title}: пока пусто`, description: 'Здесь появятся записи.' },
	}),
]

problems.push(...plan(changes))
if (problems.length) {
	for (const p of problems) console.error(`✗ ${p}`)
	process.exit(1)
}
if (dryRun) {
	for (const ch of changes) console.log(`${ch.kind === 'create' ? '+' : '~'} ${ch.file}`)
	process.exit(0)
}

const touched = apply(changes)
try {
	// маршрут попадает в routeTree.gen.ts плагином TanStack Router — сборка веба (секунды) его обновляет
	execFileSync('pnpm', ['--filter', '@dinastia/web', 'build'], { cwd: root, stdio: 'pipe' })
	execFileSync('pnpm', ['exec', 'biome', 'check', '--write', ...touched], { cwd: root, stdio: 'pipe' })
} catch (e) {
	console.error('✗ после генерации:', String((e as { stdout?: Buffer }).stdout ?? e))
	process.exit(1)
}
for (const f of touched) console.log(`  ${f}`)
console.log(`
Ресурс «${name}» создан: /admin/${name}. Дальше (скилл admin-resource):
  1. подписи — ${localeFile} → «${name}» (сейчас там имена полей)
  2. сортировки (sort), поиск (search), фильтры, форма создания (create), действия (actions) — features/${mod}/resources/${name}.ts
  3. пункт меню — apps/web/src/features/${mod}/nav.ts (скилл web-screens)
  4. pnpm check; e2e — открыть список, создать, отфильтровать (скилл testing)`)
