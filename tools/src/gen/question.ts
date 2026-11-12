// pnpm gen:question <type> [--title "Название"] [--dry-run] — заготовка типа вопроса (скилл question-types):
// определение (ответ текстом по допустимым вариантам — общие колонки, без миграции), редактор, просмотр,
// регистрация, строки. Вывод сразу проходит pnpm check.
import { execFileSync } from 'node:child_process'
import { root } from '../skills.ts'
import { apply, create, insertBefore, jsonSection, plan } from './markers.ts'

const args = process.argv.slice(2)
const WITH_VALUE = ['--title']
const opt = (key: string) => (args.includes(`--${key}`) ? args[args.indexOf(`--${key}`) + 1] : undefined)
const type = args.find((a, i) => !a.startsWith('--') && !WITH_VALUE.includes(args[i - 1] ?? ''))
const title = opt('title')
const dryRun = args.includes('--dry-run')

if (!type || !/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(type) || type.length > 40) {
	console.error('Использование: pnpm gen:question <тип_в_snake_case> [--title "Название"] [--dry-run]')
	process.exit(1)
}

const camel = type.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())
const Pascal = camel[0]?.toUpperCase() + camel.slice(1)
const dir = `packages/questions/src/${type}`
const label = title ?? type

const changes = [
	create(
		`${dir}/definition.ts`,
		`import { emptyDoc, Id, RichText } from '@dinastia/contracts/common'
import { z } from 'zod'
import { Points, PromptText } from '../common.ts'
import { defineQuestion } from '../define.ts'

const doc = (text: string) => ({ type: 'doc' as const, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const normalize = (s: string, caseSensitive: boolean) => {
	const t = s.trim().replace(/\\s+/g, ' ')
	return caseSensitive ? t : t.toLowerCase()
}

/** ${label}. Общие колонки questions + uses (скилл question-types); новая колонка или вид элемента — миграция. */
export const ${camel} = defineQuestion({
	type: '${type}',
	uses: { columns: ['caseSensitive'], items: ['accepted_text'] },
	schema: z.object({
		prompt: PromptText,
		explanation: RichText.nullable(),
		points: Points,
		caseSensitive: z.boolean(),
		answers: z
			.array(z.object({ id: Id.optional(), text: z.string().trim().min(1).max(200) }))
			.min(1)
			.max(20),
	}),
	items: { answers: 'accepted_text' },
	defaults: () => ({ prompt: emptyDoc(), explanation: null, points: 1, caseSensitive: false, answers: [{ text: '' }] }),
	example: () => ({
		prompt: doc('Столица Франции?'),
		explanation: null,
		points: 1,
		caseSensitive: false,
		answers: [{ text: 'Париж' }],
	}),
	secretKeys: ['answers', 'explanation'],
	toPublic: ({ prompt, points }) => ({ prompt, points }),
	responseSchema: z.object({ text: z.string().max(500) }),
	grade: (q, r) => {
		const given = normalize(r.text, q.caseSensitive)
		const isCorrect = given !== '' && q.answers.some((a) => normalize(a.text, q.caseSensitive) === given)
		return { score: isCorrect ? q.points : 0, max: q.points, isCorrect }
	},
	review: (q) => ({ correct: q.answers.map((a) => a.text), explanation: q.explanation }),
	shuffle: false,
})
`,
	),
	create(
		`${dir}/editor.tsx`,
		`import { Field, Input } from '@dinastia/ui'
import { RichTextEditor } from '@dinastia/ui/rich-text'
import { useTranslation } from 'react-i18next'
import type { QuestionEditorProps } from '../types.ts'
import type { ${camel} } from './definition.ts'

export default function ${Pascal}Editor({ value, onChange, readOnly, testId }: QuestionEditorProps<typeof ${camel}>) {
	const { t } = useTranslation('questions')
	return (
		<div className="grid gap-4">
			<Field id={\`\${testId}-prompt\`} label={t('fields.prompt')}>
				<RichTextEditor
					id={\`\${testId}-prompt\`}
					profile="lesson"
					value={value.prompt}
					onChange={(prompt) => onChange({ ...value, prompt })}
					aria-label={t('fields.prompt')}
					disabled={readOnly === true}
					testId={\`\${testId}-prompt\`}
				/>
			</Field>
			<Field id={\`\${testId}-answer\`} label={t('${type}.answer')}>
				<Input
					id={\`\${testId}-answer\`}
					value={value.answers[0]?.text ?? ''}
					disabled={readOnly}
					onChange={(e) => onChange({ ...value, answers: [{ ...value.answers[0], text: e.target.value }] })}
					data-testid={\`\${testId}-answer\`}
				/>
			</Field>
		</div>
	)
}
`,
	),
	create(
		`${dir}/viewer.tsx`,
		`import { Input } from '@dinastia/ui'
import { RichTextView } from '@dinastia/ui/rich-text'
import { useTranslation } from 'react-i18next'
import type { QuestionViewerProps } from '../types.ts'
import type { ${camel} } from './definition.ts'

export default function ${Pascal}Viewer({ data, response, onChange, review, testId }: QuestionViewerProps<typeof ${camel}>) {
	const { t } = useTranslation('questions')
	return (
		<div className="grid gap-3" data-testid={testId}>
			<RichTextView doc={data.prompt} />
			<Input
				aria-label={t('${type}.answer')}
				value={response?.text ?? ''}
				disabled={!onChange}
				onChange={(e) => onChange?.({ text: e.target.value })}
				data-testid={\`\${testId}-input\`}
			/>
			{review && (
				<p className="text-sm" data-testid={\`\${testId}-correct\`}>
					{t('host.correctAnswer')}: {review.correct.join(', ')}
				</p>
			)}
		</div>
	)
}
`,
	),
	insertBefore(
		'packages/questions/src/registry.ts',
		'question:import',
		`import { ${camel} } from './${type}/definition.ts'`,
	),
	insertBefore('packages/questions/src/registry.ts', 'question:entry', `${type}: ${camel},`),
	insertBefore(
		'packages/questions/src/registry.client.ts',
		'question:client',
		`${type}: {\n\ticon: DEFAULT_QUESTION_ICON,\n\tEditor: lazy(() => import('./${type}/editor.tsx')),\n\tViewer: lazy(() => import('./${type}/viewer.tsx')),\n},`,
	),
	jsonSection('packages/i18n/locales/ru/questions.json', type, {
		title: label,
		description: `Вопрос «${label}»`,
		answer: 'Ответ',
	}),
	// подпись типа в банке вопросов (фильтр и колонка «Тип»)
	jsonSection('packages/i18n/locales/ru/assessments.json', `questions.values.type.${type}`, label),
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
console.log(`
Тип вопроса «${type}» создан. Дальше (скилл question-types):
  1. данные — ${dir}/definition.ts: uses (колонки questions и виды элементов), schema, items, toPublic, grade, review;
     не хватает общих колонок/видов — миграция и согласование (скилл db-schema)
  2. редактор и просмотр — ${dir}/editor.tsx, viewer.tsx; строки — packages/i18n/locales/ru/questions.json → ${type}
  3. иконка — packages/questions/src/registry.client.ts (lucide-react)
  4. тесты: верный, неверный, частичный, пустой ответ и toPublic
  5. pnpm check`)
