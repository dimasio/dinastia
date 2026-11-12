// Проверка поставки (5.8, скилл release-deploy): `pnpm delivery:check` собирает API и веб и смотрит, что уходит на сервер —
// без комментариев нашего кода, карт исходников, песочниц и dev-команд; собранный API стартует и отвечает `/health/live`.
// Комментарии остаются в исходниках (документация для агентов), из поставки их убирает сборка (решение владельца).
import { type ChildProcess, spawn } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = join(import.meta.dirname, '../..')
const apiDist = join(root, 'apps/api/dist')
const webDist = join(root, 'apps/web/dist')
const issues: string[] = []

const walk = (dir: string): string[] =>
	readdirSync(dir).flatMap((name) => {
		const full = join(dir, name)
		return statSync(full).isDirectory() ? walk(full) : [full]
	})
const rel = (file: string) => relative(root, file)

/** Комментарий в собранном JS/CSS: строка с `//` или блок `/* …`; лицензии `/*!` и пометки `/*#__PURE__*\/` — можно. */
const COMMENT = /(^|[\s;{}()])\/\/\s|\/\*(?![!#@*]|\s*[#@]__)\s/m
/** Комментарии внутри строк сторонних пакетов (не наш код, сборка их не трогает): CSS, который вставляет prosemirror-view. */
const THIRD_PARTY = ["/* the above doesn't seem to work in Edge */"]
const hasComment = (code: string) => COMMENT.test(THIRD_PARTY.reduce((c, s) => c.replaceAll(s, ''), code))

const API_FILE = /^(main|worker|db|ops-grant|chunk-[A-Z0-9]+)\.js$|\.LEGAL\.txt$/
/** Строки dev-команд и песочниц, которых не должно быть в поставке. */
const DEV_MARKERS = [
	'db:seed',
	'enroll запрещён',
	'create-school',
	'emails:preview',
	'sandbox-publish',
	'QuestionEditorHost',
]

for (const file of walk(apiDist)) {
	const name = relative(apiDist, file)
	if (!API_FILE.test(name)) issues.push(`${rel(file)}: лишний файл в поставке API`)
	if (!name.endsWith('.js')) continue
	const code = readFileSync(file, 'utf8')
	if (hasComment(code)) issues.push(`${rel(file)}: комментарий в сборке`)
	if (code.includes('sourceMappingURL')) issues.push(`${rel(file)}: ссылка на карту исходников`)
	for (const marker of DEV_MARKERS) if (code.includes(marker)) issues.push(`${rel(file)}: dev-код («${marker}»)`)
}

for (const file of walk(webDist)) {
	const name = relative(webDist, file)
	if (name.startsWith('.') || name.endsWith('.map')) issues.push(`${rel(file)}: служебный файл или карта исходников`)
	if (name === 'index.html' && readFileSync(file, 'utf8').includes('<!--'))
		issues.push(`${rel(file)}: HTML-комментарий`)
	if (!/\.(js|css)$/.test(name)) continue
	const code = readFileSync(file, 'utf8')
	if (hasComment(code)) issues.push(`${rel(file)}: комментарий в сборке`)
	if (code.includes('sourceMappingURL')) issues.push(`${rel(file)}: ссылка на карту исходников`)
	for (const marker of DEV_MARKERS) if (code.includes(marker)) issues.push(`${rel(file)}: dev-код («${marker}»)`)
}

/** Собранный API стартует (конфиг — из `.env` или окружения) и отвечает `/health/live`. */
async function smoke() {
	const port = 3900 + Math.floor(Math.random() * 90)
	const api: ChildProcess = spawn(process.execPath, ['dist/main.js'], {
		cwd: join(root, 'apps/api'),
		env: { ...process.env, API_PORT: String(port) },
		stdio: ['ignore', 'ignore', 'pipe'],
	})
	let stderr = ''
	api.stderr?.on('data', (chunk) => {
		stderr += chunk
	})
	try {
		for (let i = 0; i < 40; i++) {
			if (api.exitCode !== null) break
			const res = await fetch(`http://localhost:${port}/health/live`).catch(() => null)
			if (res?.ok) return
			await new Promise((r) => setTimeout(r, 250))
		}
		issues.push(`apps/api/dist/main.js не отвечает /health/live${stderr ? `:\n${stderr.trim()}` : ''}`)
	} finally {
		api.kill()
	}
}
await smoke()

if (issues.length) {
	console.error(`поставка — ${issues.length} замечаний:\n${issues.map((i) => `  ${i}`).join('\n')}`)
	process.exit(1)
}
console.log('delivery:check — ok: без комментариев, карт исходников и dev-кода; собранный API отвечает')
