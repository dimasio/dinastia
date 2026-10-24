import { sql } from 'drizzle-orm'
import { db, type Tx } from './client.ts'

/**
 * Выполнить fn в транзакции школы (D-006): `app.school_id` (и `app.user_id`, если передан) ставятся до первого
 * запроса и живут только в этой транзакции (`set_config(..., true)`), поэтому соединение пула не «запоминает» школу.
 */
export async function withTenant<T>(
	schoolId: string,
	fn: (tx: Tx) => Promise<T>,
	opts: { userId?: string | undefined } = {},
): Promise<T> {
	return db.transaction(async (tx) => {
		await tx.execute(
			sql`select set_config('app.school_id', ${schoolId}, true), set_config('app.user_id', ${opts.userId ?? ''}, true)`,
		)
		return fn(tx)
	})
}

/**
 * Транзакция пользователя без школы: видны только его собственные записи по политикам «своё» (список своих школ).
 */
export async function withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
	return db.transaction(async (tx) => {
		await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`)
		return fn(tx)
	})
}
