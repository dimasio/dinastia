// pnpm test:repeat [-n 5] [-- <команда>] — поймать плавающий тест (скилл debugging): команда N раз подряд, полный лог
// каждого упавшего прогона — в test-results/flaky/<время>/run-<i>.log (у e2e — ещё папка артефактов Playwright),
// в конце — какие тесты падали и сколько раз. Команда по умолчанию — тесты api; под нагрузкой — `-- pnpm check`.
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { root } from './skills.ts'

const argv = process.argv.slice(2).filter((a, i, all) => !(a === '--' && i === all.indexOf('--') && i === 0))
const sep = argv.indexOf('--')
const own = sep >= 0 ? argv.slice(0, sep) : argv
const command = sep >= 0 ? argv.slice(sep + 1) : ['pnpm', '--filter', '@dinastia/api', 'test']
const n = Number(own[own.indexOf('-n') + 1] ?? 5) || 5
if (!command.length) {
	console.error('Использование: pnpm test:repeat [-n 5] [-- <команда>]   (по умолчанию — тесты api)')
	process.exit(1)
}

/** Цвета терминала в выводе vitest/Playwright. */
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g')
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outDir = join(root, 'test-results', 'flaky', stamp)
/** Имя упавшего теста из вывода vitest («FAIL  файл > описание > тест») и Playwright («✘ … › файл › тест»). */
const failedTests = (log: string) => [
	...new Set(
		log
			.split('\n')
			.map((l) => l.replace(ANSI, ''))
			.map((l) => /FAIL\s+(\S+\.test\.tsx?\s+>.+)$/.exec(l)?.[1] ?? /✘\s+\d+\s+(.+?)(?:\s+\(\d|$)/.exec(l)?.[1])
			.filter((x): x is string => Boolean(x))
			.map((x) => x.trim()),
	),
]

const counts = new Map<string, number>()
let failedRuns = 0
for (let i = 1; i <= n; i++) {
	const started = Date.now()
	const r = spawnSync(command[0] as string, command.slice(1), { cwd: root, env: process.env, maxBuffer: 1 << 28 })
	const log = `${r.stdout}${r.stderr}`
	const s = Math.round((Date.now() - started) / 1000)
	if (r.status === 0) {
		console.log(`✓ прогон ${i}/${n} — ${s} с`)
		continue
	}
	failedRuns++
	mkdirSync(outDir, { recursive: true })
	writeFileSync(join(outDir, `run-${i}.log`), log)
	// артефакты Playwright (trace, скриншоты) следующий прогон сотрёт — копируем
	if (existsSync(join(root, 'test-results')) && command.join(' ').includes('playwright'))
		cpSync(join(root, 'test-results'), join(outDir, `run-${i}-artifacts`), {
			recursive: true,
			filter: (src) => !src.includes(join('test-results', 'flaky')),
		})
	const tests = failedTests(log)
	for (const t of tests) counts.set(t, (counts.get(t) ?? 0) + 1)
	console.log(`✗ прогон ${i}/${n} — ${s} с; упали: ${tests.length ? tests.join('; ') : 'не распознано — см. лог'}`)
}

console.log(`\nкоманда: ${command.join(' ')}`)
if (!failedRuns) console.log(`test:repeat — ${n} из ${n} зелёные`)
else {
	console.log(`test:repeat — упало ${failedRuns} из ${n}; логи: ${outDir}`)
	for (const [t, c] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`  ${c}× ${t}`)
}
process.exitCode = failedRuns ? 1 : 0
