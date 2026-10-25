// Фоновые задачи в тестах (скилл testing): настоящий воркер pg-boss в процессе теста + ожидание, пока очереди опустеют.
import { sql } from 'drizzle-orm'
import type { PgBoss } from 'pg-boss'
import { BOSS_SCHEMA, workerBoss } from '#/kernel/boss.ts'
import { db } from '#/kernel/db/client.ts'
import { startWorkers } from '#/kernel/worker-runtime.ts'

let running: { boss: PgBoss; stop: () => Promise<void> } | null = null

/** Запустить обработчики всех зарегистрированных задач (регистрируй тестовые задачи до вызова). */
export async function startTestWorker() {
	if (running) return
	const boss = workerBoss()
	await boss.start()
	const stop = await startWorkers(boss, { pollingIntervalSeconds: 0.5 })
	running = { boss, stop }
}

export async function stopTestWorker() {
	if (!running) return
	await running.stop()
	await running.boss.stop({ graceful: true, timeout: 5_000 })
	running = null
}

/** Сколько задач ещё ждут или выполняются (без отложенных на будущее). */
export async function pendingJobs(): Promise<number> {
	const rows = await db.execute<{ n: number }>(
		sql`select count(*)::int as n from ${sql.raw(BOSS_SCHEMA)}.job
			where state in ('created', 'retry', 'active') and start_after <= now()`,
	)
	return rows.rows[0]?.n ?? 0
}

/** Дождаться, пока воркер выполнит все готовые задачи (в т.ч. поставленные подписчиками по ходу). */
export async function drainJobs(timeoutMs = 15_000) {
	const deadline = Date.now() + timeoutMs
	while (Date.now() < deadline) {
		if ((await pendingJobs()) === 0) return
		await new Promise((r) => setTimeout(r, 100))
	}
	throw new Error(`задачи не выполнились за ${timeoutMs} мс: ждут ${await pendingJobs()}`)
}

/** Состояния задач очереди (для проверок повтора и окончательной ошибки). */
export async function jobStates(name: string) {
	const rows = await db.execute<{ state: string; retry_count: number }>(
		sql`select state, retry_count from ${sql.raw(BOSS_SCHEMA)}.job where name = ${name} order by created_on`,
	)
	return rows.rows
}
