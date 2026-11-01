// Фоновые задачи в тестах (скилл testing): настоящий воркер pg-boss в процессе теста + ожидание, пока очереди опустеют.
import { sql } from 'drizzle-orm'
import type { PgBoss } from 'pg-boss'
import { BOSS_SCHEMA, workerBoss } from '#/kernel/boss.ts'
import { db } from '#/kernel/db/client.ts'
import { memoryOutbox } from '#/kernel/mail/transport.ts'
import { allJobs } from '#/kernel/registry.ts'
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
/**
 * Готовые к выполнению задачи очередей, которые знает реестр этого процесса. Чужие — не считаем: схема очереди общая
 * у файлов одного процесса vitest, и пробные задачи другого файла (probe.*) здесь некому выполнить — ожидание
 * «пока опустеет вся очередь» зависало (тест аватара, 2.1).
 */
async function pendingRows(): Promise<{ name: string }[]> {
	const names = allJobs().map((j) => j.name)
	if (!names.length) return []
	const rows = await db.execute<{ name: string }>(
		sql`select name from ${sql.raw(BOSS_SCHEMA)}.job
			where state in ('created', 'retry', 'active') and start_after <= now()
			and name in (${sql.join(
				names.map((n) => sql`${n}`),
				sql`, `,
			)})`,
	)
	return rows.rows
}

export async function pendingJobs(): Promise<number> {
	return (await pendingRows()).length
}

/** Дождаться, пока воркер выполнит все готовые задачи (в т.ч. поставленные подписчиками по ходу). Лимит — меньше
 * лимита теста (15 с), чтобы сообщение «что ждёт» успело появиться. */
export async function drainJobs(timeoutMs = 10_000) {
	const deadline = Date.now() + timeoutMs
	while (Date.now() < deadline) {
		if ((await pendingJobs()) === 0) return
		await new Promise((r) => setTimeout(r, 100))
	}
	const waiting = (await pendingRows()).map((r) => r.name)
	throw new Error(
		`задачи не выполнились за ${timeoutMs} мс: ждут ${waiting.length} — ${[...new Set(waiting)].join(', ')}`,
	)
}

/** Состояния задач очереди (для проверок повтора и окончательной ошибки). */
export async function jobStates(name: string) {
	const rows = await db.execute<{ state: string; retry_count: number }>(
		sql`select state, retry_count from ${sql.raw(BOSS_SCHEMA)}.job where name = ${name} order by created_on`,
	)
	return rows.rows
}

/** Последнее письмо на адрес после выполнения очереди (письма уходят задачами). */
export async function lastMailTo(to: string) {
	await drainJobs()
	const mail = memoryOutbox.findLast((m) => m.to === to)
	if (!mail) throw new Error(`нет письма на ${to}`)
	return mail
}

/** Токен из ссылки приглашения в последнем письме на адрес. */
export async function inviteToken(to: string) {
	const token = (await lastMailTo(to)).text.match(/\/invite\/([\w-]+)/)?.[1]
	if (!token) throw new Error(`в письме на ${to} нет ссылки приглашения`)
	return token
}
