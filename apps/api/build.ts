// Сборка поставки API (5.8, D-066): `pnpm --filter @dinastia/api build` → `dist/*.js`, запуск — `node dist/<вход>.js`.
// Внутрь — наш код и пакеты `@dinastia/*` (в node_modules это исходники TS), снаружи — зависимости `apps/api` (их ставит
// `pnpm deploy --prod`). Комментарии остаются в исходниках, в поставке их нет: `minifyWhitespace` убирает и комментарии, и
// пометки путей файлов; имена функций не сжимаются — стеки ошибок в GlitchTip читаемы. Лицензии собранных сторонних пакетов —
// в `dist/*.LEGAL.txt`. Карт исходников нет. Dev-команды (сиды, enroll, create-school, предпросмотр писем) в сборку не входят.
import { readFileSync, rmSync } from 'node:fs'
import { build } from 'esbuild'

const pkg = JSON.parse(readFileSync(new URL('package.json', import.meta.url), 'utf8')) as {
	dependencies: Record<string, string>
}
const external = Object.keys(pkg.dependencies).filter((name) => !name.startsWith('@dinastia/'))

/** Входы поставки: HTTP, воркер задач, миграции (`node dist/db.js migrate`), выдача прав оператора. */
const entryPoints = {
	main: 'src/main.ts',
	worker: 'src/worker.ts',
	db: 'src/kernel/db/cli.ts',
	'ops-grant': 'src/ops-grant.ts',
}

rmSync(new URL('dist/', import.meta.url), { recursive: true, force: true })
await build({
	absWorkingDir: import.meta.dirname,
	entryPoints,
	outdir: 'dist',
	// общий код — чанками рядом со входами: `kernel/paths.ts` считает корень apps/api от `dist/`
	chunkNames: '[name]-[hash]',
	bundle: true,
	splitting: true,
	format: 'esm',
	platform: 'node',
	target: 'node24',
	jsx: 'automatic',
	external: [...external, ...external.map((name) => `${name}/*`)],
	minifyWhitespace: true,
	legalComments: 'external',
	sourcemap: false,
	logLevel: 'warning',
})
