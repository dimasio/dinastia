// Приложение для пакета Windows (D-069, docs/guide/windows.md): `pnpm windows:app` → `out/windows/app/` — собранные API, воркер,
// миграции и сид учебного центра АИР «Горизонт», веб и шлюз. Зависимости API ставятся плоским `node_modules` без симлинков
// (`npm install --omit=dev`, версии — те же, что в lockfile у `apps/api`): инсталлятор переносит его как обычные файлы.
// Среды выполнения (Node, PostgreSQL, SeaweedFS, Mailpit, Chromium), лаунчер и инсталлятор собирает `tools/windows/build.ps1`.
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { build } from 'esbuild'

const root = join(import.meta.dirname, '../../..')
const apiDir = join(root, 'apps/api')
const out = join(root, 'out/windows/app')
const shell = process.platform === 'win32'

const run = (cmd: string, args: string[], cwd = root) => execFileSync(cmd, args, { cwd, stdio: 'inherit', shell })

run('pnpm', ['--filter', '@dinastia/api', 'build'])
run('pnpm', ['--filter', '@dinastia/web', 'build'])

rmSync(out, { recursive: true, force: true })
mkdirSync(join(out, 'api'), { recursive: true })
cpSync(join(apiDir, 'dist'), join(out, 'api/dist'), { recursive: true })
cpSync(join(apiDir, 'drizzle'), join(out, 'api/drizzle'), { recursive: true })
cpSync(join(root, 'apps/web/dist'), join(out, 'web'), { recursive: true })

const pkg = JSON.parse(readFileSync(join(apiDir, 'package.json'), 'utf8')) as { dependencies: Record<string, string> }
const external = Object.keys(pkg.dependencies).filter((name) => !name.startsWith('@dinastia/'))

// сид учебного центра — только в этом пакете (в серверную поставку не входит, D-066); один файл рядом со входами API —
// `kernel/paths.ts` считает корень от `dist/`
await build({
	absWorkingDir: apiDir,
	entryPoints: { seed: 'src/seed.ts' },
	outdir: join(out, 'api/dist'),
	bundle: true,
	format: 'esm',
	platform: 'node',
	target: 'node24',
	jsx: 'automatic',
	external: [...external, ...external.map((name) => `${name}/*`)],
	minifyWhitespace: true,
	legalComments: 'none',
	logLevel: 'warning',
})

await build({
	absWorkingDir: root,
	entryPoints: { gateway: 'tools/src/windows/gateway.ts' },
	outdir: out,
	bundle: true,
	format: 'esm',
	platform: 'node',
	target: 'node24',
	minifyWhitespace: true,
	legalComments: 'none',
	logLevel: 'warning',
})

/** Точная версия, установленная у `apps/api` (= lockfile). */
const installed = (name: string) =>
	(JSON.parse(readFileSync(join(apiDir, 'node_modules', name, 'package.json'), 'utf8')) as { version: string }).version
const dependencies = Object.fromEntries(external.map((name) => [name, installed(name)]))
writeFileSync(
	join(out, 'api/package.json'),
	`${JSON.stringify({ name: 'dinastia-api', private: true, type: 'module', dependencies }, null, '\t')}\n`,
)
run(
	'npm',
	['install', '--omit=dev', '--no-bin-links', '--no-audit', '--no-fund', '--no-package-lock', '--loglevel=error'],
	join(out, 'api'),
)

const release = process.env.APP_RELEASE ?? 'dev'
const commit = existsSync(join(root, '.git'))
	? execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
	: ''
writeFileSync(
	join(out, 'version.json'),
	`${JSON.stringify({ release, commit, builtAt: new Date().toISOString() }, null, '\t')}\n`,
)
console.log(`windows:app — ok: ${out} (${release}${commit ? ` ${commit}` : ''})`)
