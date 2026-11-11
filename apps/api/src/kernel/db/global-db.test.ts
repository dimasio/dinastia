// Инвариант изоляции (5.1, скилл security-baseline): доменные модули работают с БД только через `ctx.db` — транзакцию школы с RLS.
// Глобальный клиент (`db`, `pool` из `kernel/db/client.ts`) в `modules/**` — только в перечисленных местах с причиной.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const MODULES = join(import.meta.dirname, '../../modules')

/** Файл модуля → почему ему нужен глобальный клиент. Новое исключение — с согласия человека. */
const ALLOWED: Record<string, string> = {
	'ops/service.ts':
		'консоль оператора (5.6б): глобальные таблицы школ, метрик и журнала; данные школ — через withTenant/withUser',
	'ops/router.ts': 'консоль оператора работает вне школы (D-026, 5.6): свои данные оператора и журнал консоли',
	'schools/service.ts':
		'регистрация школы: строки `schools` ещё нет — тенанта нет; поиск школы по slug (таблица `schools` глобальная)',
}

const files = (dir: string): string[] =>
	readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
		e.isDirectory()
			? files(join(dir, e.name))
			: /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)
				? [join(dir, e.name)]
				: [],
	)

/** Импорт значения (не `import type`) `db` или `pool` из клиента БД ядра. */
const GLOBAL_DB = /import\s+\{([^}]*)\}\s+from\s+'(?:#\/kernel|(?:\.\.\/)+kernel)\/db\/client\.ts'/g
const usesGlobalDb = (source: string) =>
	[...source.matchAll(GLOBAL_DB)].some((m) =>
		(m[1] ?? '')
			.split(',')
			.map((s) => s.trim())
			.some((name) => name === 'db' || name === 'pool'),
	)

describe('глобальный клиент БД в модулях', () => {
	it('только в разрешённых местах', () => {
		const offenders = files(MODULES)
			.filter((f) => usesGlobalDb(readFileSync(f, 'utf8')))
			.map((f) => relative(MODULES, f))
			.filter((f) => !(f in ALLOWED))
		expect(offenders, 'модуль работает через ctx.db (RLS); исключение — в ALLOWED с причиной').toEqual([])
	})

	it('исключения не устарели', () => {
		const stale = Object.keys(ALLOWED).filter((f) => !usesGlobalDb(readFileSync(join(MODULES, f), 'utf8')))
		expect(stale).toEqual([])
	})
})
