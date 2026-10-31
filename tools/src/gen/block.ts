// pnpm gen:block <type> [--title "Название"] [--category content|media|interactive|layout] [--no-migration] [--dry-run]
// — заготовка типа блока урока (скилл lesson-blocks): таблица, определение, редактор, просмотр, регистрация, строки,
// миграция. Вывод сразу проходит pnpm check.
import { execFileSync } from 'node:child_process'
import { root } from '../skills.ts'
import { apply, create, insertBefore, jsonSection, plan } from './markers.ts'

const args = process.argv.slice(2)
const WITH_VALUE = ['--title', '--category']
const opt = (key: string) => (args.includes(`--${key}`) ? args[args.indexOf(`--${key}`) + 1] : undefined)
const type = args.find((a, i) => !a.startsWith('--') && !WITH_VALUE.includes(args[i - 1] ?? ''))
const title = opt('title')
const category = opt('category') ?? 'content'
const dryRun = args.includes('--dry-run')
const migration = !args.includes('--no-migration')

if (!type || !/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(type) || type.length > 40) {
	console.error(
		'Использование: pnpm gen:block <тип_в_snake_case> [--title "Название"] [--category content|media|interactive|layout] [--no-migration] [--dry-run]',
	)
	process.exit(1)
}
if (!['content', 'media', 'interactive', 'layout'].includes(category)) {
	console.error(`Категория «${category}»: content | media | interactive | layout`)
	process.exit(1)
}

const camel = type.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())
const Pascal = camel[0]?.toUpperCase() + camel.slice(1)
const dir = `packages/blocks/src/${type}`
const label = title ?? type

const changes = [
	create(
		`${dir}/definition.ts`,
		`import { z } from 'zod'
import { defineBlock } from '../define.ts'

/** ${label}. Поля схемы = колонки ./table.ts (скилл lesson-blocks). */
export const ${camel} = defineBlock({
	type: '${type}',
	category: '${category}',
	schema: z.object({
		text: z.string().max(2000),
	}),
	defaults: () => ({ text: '' }),
	completion: 'none',
})
`,
	),
	create(
		`${dir}/table.ts`,
		`import { blockTable } from '@dinastia/db'
import { text } from 'drizzle-orm/pg-core'

/** block_${type}: данные блока — колонки (скилл db-schema); изменение — миграция. */
export const block${Pascal} = blockTable('${type}', {
	text: text('text').notNull().default(''),
})
`,
	),
	create(
		`${dir}/editor.tsx`,
		`import { Field, Input } from '@dinastia/ui'
import { useTranslation } from 'react-i18next'
import type { BlockEditorProps } from '../types.ts'
import type { ${camel} } from './definition.ts'

export default function ${Pascal}Editor({ value, onChange, readOnly, testId }: BlockEditorProps<typeof ${camel}>) {
	const { t } = useTranslation('blocks')
	return (
		<Field id={\`\${testId}-text\`} label={t('${type}.fields.text')}>
			<Input
				id={\`\${testId}-text\`}
				value={value.text}
				onChange={(e) => onChange({ ...value, text: e.target.value })}
				disabled={readOnly}
				data-testid={\`\${testId}-text\`}
			/>
		</Field>
	)
}
`,
	),
	create(
		`${dir}/viewer.tsx`,
		`import type { BlockViewerProps } from '../types.ts'
import type { ${camel} } from './definition.ts'

export default function ${Pascal}Viewer({ data, testId }: BlockViewerProps<typeof ${camel}>) {
	return <p data-testid={testId}>{data.text}</p>
}
`,
	),
	insertBefore('packages/blocks/src/registry.ts', 'block:import', `import { ${camel} } from './${type}/definition.ts'`),
	insertBefore('packages/blocks/src/registry.ts', 'block:entry', `${type}: ${camel},`),
	insertBefore(
		'packages/blocks/src/server.ts',
		'block:server-import',
		`import { ${camel} } from './${type}/definition.ts'\nimport { block${Pascal} } from './${type}/table.ts'`,
	),
	insertBefore(
		'packages/blocks/src/server.ts',
		'block:storage',
		`${type}: defineBlockStorage(${camel}, block${Pascal}),`,
	),
	insertBefore('packages/blocks/src/tables.ts', 'block:tables', `export * from './${type}/table.ts'`),
	insertBefore(
		'packages/blocks/src/registry.client.ts',
		'block:client',
		`${type}: {\n\ticon: DEFAULT_BLOCK_ICON,\n\tEditor: lazy(() => import('./${type}/editor.tsx')),\n\tViewer: lazy(() => import('./${type}/viewer.tsx')),\n},`,
	),
	jsonSection('packages/i18n/locales/ru/blocks.json', type, {
		title: label,
		description: `Блок «${label}»`,
		fields: { text: 'Текст' },
	}),
]

const problems = plan(changes)
if (problems.length) {
	for (const p of problems) console.error(`✗ ${p}`)
	process.exit(1)
}
if (dryRun) {
	for (const ch of changes)
		console.log(`${ch.kind === 'create' ? '+' : '~'} ${ch.file}${ch.kind === 'insert' ? `  ← ${ch.content}` : ''}`)
	if (migration) console.log(`+ apps/api/drizzle/NNNN_block_${type}.sql (pnpm db:generate)`)
	process.exit(0)
}

const touched = apply(changes)
try {
	execFileSync('pnpm', ['exec', 'biome', 'check', '--write', ...touched], { cwd: root, stdio: 'pipe' })
} catch (e) {
	console.error(
		'✗ biome check не прошёл — проверь вставки (pnpm lint):',
		String((e as { stdout?: Buffer }).stdout ?? e),
	)
	process.exit(1)
}
for (const f of touched) console.log(`  ${f}`)
if (migration) {
	execFileSync('pnpm', ['--filter', '@dinastia/api', 'db:generate', '--name', `block_${type}`], {
		cwd: root,
		stdio: 'inherit',
	})
}
console.log(`
Блок «${type}» создан. Дальше (скилл lesson-blocks):
  1. поля — ${dir}/table.ts и definition.ts (имена совпадают); после правки — pnpm db:generate --name block_${type}_…
     (миграция ещё не в main — можно удалить и сгенерировать заново)
  2. редактор и просмотр — ${dir}/editor.tsx, viewer.tsx; строки — packages/i18n/locales/ru/blocks.json → ${type}
  3. иконка — packages/blocks/src/registry.client.ts (lucide-react)
  4. секреты ученика — secretKeys + toPublic; интерактив — responseSchema + evaluate
  5. pnpm db:migrate && pnpm check`)
