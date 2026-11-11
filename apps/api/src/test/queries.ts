// Счётчик SQL-запросов (5.2, скилл performance): проверка «нет N+1» — число запросов списка не растёт с числом строк.
import pg from 'pg'

/** Сколько запросов к БД сделал `fn` (все клиенты процесса; тест вызывает по одному списку за раз). */
export async function countQueries(fn: () => Promise<unknown>): Promise<number> {
	const proto = pg.Client.prototype as unknown as { query: (...args: unknown[]) => unknown }
	const original = proto.query
	let n = 0
	proto.query = function (this: unknown, ...args: unknown[]) {
		n++
		return original.apply(this, args)
	}
	try {
		await fn()
	} finally {
		proto.query = original
	}
	return n
}
