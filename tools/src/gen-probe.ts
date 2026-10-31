// pnpm gen:probe [--keep] — проверить генераторы на рабочей копии, не трогая её (скиллы core-kernel, roadmap-task):
// временный git worktree с текущими правками (в т.ч. незакоммиченными) → каждый генератор дважды (второй вызов ловит
// ошибки маркеров и дублей) → typecheck, lint, тесты, check:registries → worktree удаляется. Dev-база не меняется:
// тесты идут в dinastia_test, которую global-setup пересоздаёт. Не запускать параллельно с тестами в основной копии.
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { root } from './skills.ts'

const keep = process.argv.includes('--keep')
const git = (args: string[], cwd = root) => execFileSync('git', args, { cwd, stdio: 'pipe' }).toString()
const dir = join(mkdtempSync(join(tmpdir(), 'dinastia-probe-')), 'repo')

/** Шаги пробы: команда в worktree и что она проверяет. */
const steps: [string, string[]][] = [
	['модуль', ['gen:module', 'probe-alpha', '--title', 'Проба']],
	['модуль, второй', ['gen:module', 'probe-beta']],
	[
		'ресурс',
		[
			'gen:resource',
			'schools',
			'probe-alpha',
			'--row',
			'StaffMember',
			'--api',
			'members',
			'--perm',
			'schools.members.read',
		],
	],
	[
		'ресурс, второй',
		[
			'gen:resource',
			'schools',
			'probe-beta',
			'--row',
			'StaffMember',
			'--api',
			'members',
			'--perm',
			'schools.members.read',
		],
	],
	['блок', ['gen:block', 'probe_alpha', '--title', 'Проба']],
	['блок, второй', ['gen:block', 'probe_beta', '--category', 'media']],
	['тип вопроса', ['gen:question', 'probe_alpha', '--title', 'Проба']],
	['тип вопроса, второй', ['gen:question', 'probe_beta']],
	['типы', ['typecheck']],
	['линтер', ['lint']],
	['тесты', ['test']],
	['реестры', ['check:registries']],
	['документация', ['docs:check']],
]

function step(name: string, args: string[]) {
	process.stdout.write(`… ${name}: pnpm ${args.join(' ')}\n`)
	const r = spawnSync('pnpm', ['-s', ...args], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'], env: process.env })
	if (r.status === 0) return
	const lines = `${r.stdout}${r.stderr}`.split('\n')
	// сначала сами ошибки (tsc, biome, vitest, проверки), иначе — хвост вывода
	const errors = lines.filter((l) => /error TS\d+|× |FAIL |✗ |Error: /.test(l))
	const out = (errors.length ? errors.slice(0, 30) : lines.slice(-40)).join('\n').trim()
	throw new Error(`шаг «${name}» упал (pnpm ${args.join(' ')}):\n${out}`)
}

let failed = false
try {
	// 1. worktree с HEAD + незакоммиченные правки и новые файлы рабочей копии
	git(['worktree', 'add', '--detach', dir, 'HEAD'])
	const diff = git(['diff', 'HEAD', '--binary'])
	if (diff.trim()) execFileSync('git', ['apply', '--whitespace=nowarn'], { cwd: dir, input: diff })
	for (const file of git(['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean)) {
		mkdirSync(dirname(join(dir, file)), { recursive: true })
		copyFileSync(join(root, file), join(dir, file))
	}
	if (existsSync(join(root, '.env'))) copyFileSync(join(root, '.env'), join(dir, '.env'))
	writeFileSync(join(dir, '.probe'), 'временная копия pnpm gen:probe\n')

	// 2. зависимости из локального хранилища pnpm (быстро, без сети)
	process.stdout.write('… зависимости: pnpm install --prefer-offline\n')
	execFileSync('pnpm', ['install', '--prefer-offline', '--frozen-lockfile'], { cwd: dir, stdio: 'pipe' })

	// 3. генераторы и проверки
	for (const [name, args] of steps) step(name, args)
	console.log(
		'\n✓ gen:probe — вывод всех генераторов (по два вызова) проходит typecheck, lint, тесты и check:registries',
	)
} catch (e) {
	failed = true
	console.error(`\n✗ gen:probe — ${e instanceof Error ? e.message : String(e)}`)
	if (keep) console.error(`\nкопия оставлена: ${dir}`)
} finally {
	if (!keep || !failed) {
		try {
			git(['worktree', 'remove', '--force', dir])
		} catch {
			git(['worktree', 'prune'])
		}
	}
}
process.exitCode = failed ? 1 : 0
