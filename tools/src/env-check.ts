// pnpm env:check — готово ли окружение к работе (скилл local-env): Node и pnpm нужных версий, .env полон, Docker и
// сервисы живы, миграции применены, демо-данные есть, порты свободны. На каждую проблему — команда исправления.
// Запускать в начале сессии и когда «что-то не стартует». Код возврата 1 — есть блокирующие проблемы.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createConnection } from 'node:net'
import { join } from 'node:path'
import { root } from './skills.ts'

type Level = 'ok' | 'warn' | 'fail'
const results: { level: Level; what: string; fix?: string }[] = []
const report = (level: Level, what: string, fix?: string) => results.push({ level, what, ...(fix ? { fix } : {}) })

function run(cmd: string, args: string[]): string | null {
	try {
		return execFileSync(cmd, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], timeout: 20_000 })
			.toString()
			.trim()
	} catch {
		return null
	}
}

const envKeys = (file: string) =>
	new Set(
		readFileSync(join(root, file), 'utf8')
			.split('\n')
			.map((l) => /^([A-Z][A-Z0-9_]*)=/.exec(l)?.[1])
			.filter((k): k is string => Boolean(k)),
	)

function portBusy(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const socket = createConnection({ port, host: '127.0.0.1' })
		socket.once('connect', () => {
			socket.destroy()
			resolve(true)
		})
		socket.once('error', () => resolve(false))
		socket.setTimeout(500, () => {
			socket.destroy()
			resolve(false)
		})
	})
}

// 1. Node и pnpm
const wantNode = readFileSync(join(root, '.nvmrc'), 'utf8').trim()
const nodeMajor = process.versions.node.split('.')[0]
if (nodeMajor === wantNode) report('ok', `Node ${process.versions.node}`)
else
	report(
		'fail',
		`Node ${process.versions.node}, нужен ${wantNode} (.nvmrc): drizzle-kit не поймёт импорты #/…, тесты упадут`,
		'source ~/.nvm/nvm.sh && nvm use   # и дальше в той же оболочке',
	)
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { packageManager?: string }
const wantPnpm = pkg.packageManager?.split('@')[1]
const pnpmVersion = run('pnpm', ['--version'])
if (pnpmVersion && pnpmVersion === wantPnpm) report('ok', `pnpm ${pnpmVersion}`)
else
	report(
		'warn',
		`pnpm ${pnpmVersion ?? 'не найден'}, в package.json — ${wantPnpm}`,
		'corepack enable && corepack prepare',
	)

// 2. .env
if (!existsSync(join(root, '.env'))) report('fail', 'нет .env', 'cp .env.example .env')
else {
	const missing = [...envKeys('.env.example')].filter((k) => !envKeys('.env').has(k))
	if (missing.length)
		report(
			'warn',
			`в .env нет ключей из .env.example: ${missing.join(', ')} — работают значения по умолчанию из config.ts, если они есть`,
			'перенести строки из .env.example в .env',
		)
	else report('ok', '.env полон')
}

// 3. Docker и сервисы
const compose = ['compose', '-f', 'docker/compose.yml', '--env-file', '.env']
if (run('docker', ['info', '--format', '{{.ServerVersion}}']) === null)
	report('fail', 'Docker не запущен', 'open -a Docker   # macOS; затем pnpm env:up')
else {
	const ps = run('docker', [...compose, 'ps', '--format', '{{.Service}} {{.Health}} {{.State}}'])
	const services = new Map(
		(ps ?? '')
			.split('\n')
			.filter(Boolean)
			.map((l) => [l.split(' ')[0], l] as const),
	)
	for (const s of ['postgres', 'seaweedfs', 'mailpit']) {
		const line = services.get(s)
		if (line?.includes('healthy') && !line.includes('unhealthy')) report('ok', `${s} — healthy`)
		else report('fail', `${s} — ${line ? line.split(' ').slice(1).join(' ') : 'не запущен'}`, 'pnpm env:up')
	}

	// 4. Миграции и демо-данные (dev-база)
	const psql = (sql: string) =>
		run('docker', [...compose, 'exec', '-T', 'postgres', 'psql', '-U', 'postgres', '-d', 'dinastia', '-tAc', sql])
	if (services.get('postgres')?.includes('healthy')) {
		const files = readdirSync(join(root, 'apps/api/drizzle')).filter((f) => f.endsWith('.sql')).length
		const applied = Number(psql('select count(*) from drizzle.__drizzle_migrations') ?? -1)
		if (applied === files) report('ok', `миграции применены (${files})`)
		else if (applied > files)
			report(
				'warn',
				`в dev-базе миграций ${applied}, файлов ${files} — применена миграция, которой нет в рабочей копии`,
				'скилл db-schema, «Переделать миграцию до мержа»',
			)
		else report('fail', `миграции: применено ${applied < 0 ? '?' : applied} из ${files}`, 'pnpm db:migrate')
		const demo = psql("select count(*) from schools where slug = 'demo'")
		if (demo === '1') report('ok', 'демо-данные (школа demo)')
		else report('warn', 'нет демо-данных — e2e и ручная проверка без них не пойдут', 'pnpm db:seed')
	}
}

// 5. Порты dev-серверов
const env = existsSync(join(root, '.env')) ? readFileSync(join(root, '.env'), 'utf8') : ''
const port = (key: string, fallback: number) => Number(new RegExp(`^${key}=(\\d+)`, 'm').exec(env)?.[1] ?? fallback)
for (const [name, p] of [
	['API', port('API_PORT', 3000)],
	['web', port('WEB_PORT', 5173)],
] as const) {
	if (await portBusy(p))
		report(
			'warn',
			`порт ${p} (${name}) занят — pnpm dev уже запущен или другой процесс`,
			`lsof -iTCP:${p} -sTCP:LISTEN`,
		)
	else report('ok', `порт ${p} (${name}) свободен`)
}

// 6. Браузер для e2e на macOS (Playwright 1.6x не ставит свой Chromium на macOS 13 — берёт Google Chrome)
if (process.platform === 'darwin') {
	if (existsSync('/Applications/Google Chrome.app')) report('ok', 'Google Chrome для e2e')
	else report('warn', 'нет Google Chrome — e2e на macOS его используют (channel: chrome)', 'установить Google Chrome')
}

const icon = { ok: '✓', warn: '!', fail: '✗' } as const
for (const r of results) {
	console.log(`${icon[r.level]} ${r.what}`)
	if (r.fix && r.level !== 'ok') console.log(`    → ${r.fix}`)
}
const fails = results.filter((r) => r.level === 'fail').length
console.log(fails ? `\npnpm env:check — блокирующих проблем: ${fails}` : '\npnpm env:check — окружение готово')
// exitCode, а не exit(): при выводе в pipe (pnpm, CI) exit() обрывает недописанный stdout
process.exitCode = fails ? 1 : 0
