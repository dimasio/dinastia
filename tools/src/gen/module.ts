// pnpm gen:module <имя> [--title "Название"] [--dry-run] — заготовка доменного модуля (скилл module).
import { execFileSync } from 'node:child_process'
import { root } from '../skills.ts'
import { apply, camel, create, insertBefore, plan } from './markers.ts'

const args = process.argv.slice(2)
const name = args.find((a) => !a.startsWith('--'))
const title = args.includes('--title') ? args[args.indexOf('--title') + 1] : undefined
const dryRun = args.includes('--dry-run')

const RESERVED = ['kernel', 'test', 'app', 'core', 'auth', 'ui', 'common', 'errors', 'nav', 'home', 'index']
if (!name || !/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name) || name.length > 30) {
	console.error('Использование: pnpm gen:module <имя-в-kebab-case> [--title "Название"] [--dry-run]')
	process.exit(1)
}
if (RESERVED.includes(name)) {
	console.error(`Имя «${name}» зарезервировано`)
	process.exit(1)
}

const c = camel(name)
const label = title ?? name
const api = `apps/api/src/modules/${name}`

const changes = [
	create(
		`packages/contracts/src/${name}.ts`,
		`// Контракт модуля ${name} (скилл api-endpoints): zod-схемы сущностей и процедуры oc.route.\n\nexport const ${c}Contract = {}\n`,
	),
	insertBefore('packages/contracts/src/index.ts', 'module:import', `import { ${c}Contract } from './${name}.ts'`),
	insertBefore('packages/contracts/src/index.ts', 'module:entry', `${c}: ${c}Contract,`),

	create(
		`${api}/schema.ts`,
		`// Таблицы модуля ${name} (скилл db-schema): tenantTable, tenantRef из @dinastia/db.\n\nexport {}\n`,
	),
	create(
		`${api}/service.ts`,
		`// Бизнес-логика модуля ${name} (скилл data-access): функции (ctx: SchoolCtx, input) → результат.\n\nexport {}\n`,
	),
	create(
		`${api}/router.ts`,
		`// Реализация контракта ${c} (скилл api-endpoints): impl.${c}.<процедура>.use(mw…).use(can('…')).handler(…).\n\nexport const ${c}Router = {}\n`,
	),
	create(
		`${api}/permissions.ts`,
		`import { definePermissions } from '#/kernel/permissions.ts'\n\n// Разрешения модуля (скилл permissions); owner имеет все неявно.\nexport const permissions = definePermissions('${name}', {\n\taccess: ['admin', 'teacher', 'curator', 'student'],\n})\n`,
	),
	create(
		`${api}/index.ts`,
		`import { defineModule } from '#/kernel/module.ts'\nimport { permissions } from './permissions.ts'\nimport { ${c}Router } from './router.ts'\n\nexport default defineModule({\n\tname: '${name}',\n\trouter: { ${c}: ${c}Router },\n\tpermissions,\n})\n`,
	),
	insertBefore('apps/api/src/modules/index.ts', 'module:import', `import ${c} from './${name}/index.ts'`),
	insertBefore('apps/api/src/modules/index.ts', 'module:entry', `${c},`),
	insertBefore(
		'apps/api/src/permissions.ts',
		'module:permissions-import',
		`import { permissions as ${c} } from './modules/${name}/permissions.ts'`,
	),
	insertBefore('apps/api/src/permissions.ts', 'module:permissions', `${c},`),
	insertBefore('apps/api/src/db-schema.ts', 'module:schema', `export * from './modules/${name}/schema.ts'`),

	create(`packages/i18n/locales/ru/${name}.json`, `${JSON.stringify({ nav: { title: label } }, null, '\t')}\n`),
	insertBefore(
		'packages/i18n/src/index.ts',
		'module:import',
		`import ${c} from '../locales/ru/${name}.json' with { type: 'json' }`,
	),
	insertBefore('packages/i18n/src/index.ts', 'module:entry', `${c},`),

	create(
		`apps/web/src/features/${name}/nav.ts`,
		`import { defineNav } from '#/app/nav.ts'\n\n// Пункты меню модуля ${name} (скилл web-screens), например:\n// { area: 'admin', to: '/admin/${name}', label: '${c}:nav.title', icon: BookOpen, perm: '${name}.access', group: 'content', order: 10 }\nexport const nav = defineNav([])\n`,
	),
	insertBefore('apps/web/src/features/index.ts', 'module:nav-import', `import { nav as ${c} } from './${name}/nav.ts'`),
	insertBefore('apps/web/src/features/index.ts', 'module:nav', `...${c},`),
]

const problems = plan(changes)
if (problems.length) {
	for (const p of problems) console.error(`✗ ${p}`)
	process.exit(1)
}
if (dryRun) {
	for (const ch of changes)
		console.log(`${ch.kind === 'create' ? '+' : '~'} ${ch.file}${ch.kind === 'insert' ? `  ← ${ch.content}` : ''}`)
	process.exit(0)
}

const touched = apply(changes)
execFileSync('pnpm', ['exec', 'biome', 'check', '--write', ...touched.filter((f) => !f.endsWith('.md'))], {
	cwd: root,
	stdio: 'ignore',
})
for (const f of touched) console.log(`  ${f}`)
console.log(`
Модуль «${name}» создан. Дальше (скилл module):
  1. таблицы — ${api}/schema.ts → pnpm db:generate --name ${name.replaceAll('-', '_')}_init   (скилл db-schema)
  2. контракт — packages/contracts/src/${name}.ts, роутер — ${api}/router.ts                (скилл api-endpoints)
  3. права — ${api}/permissions.ts                                                          (скилл permissions)
  4. экраны и меню — apps/web/src/routes/admin/${name}/, apps/web/src/features/${name}/nav.ts  (скилл web-screens)
  5. pnpm check`)
