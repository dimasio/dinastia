// Метрики, которые считаются при чтении `/metrics` (5.4): пул подключений БД и очереди задач pg-boss — сколько ждёт и как давно
// ждёт старейшая готовая задача (отставание воркера). Подключает процесс, отдающий метрики (`main.ts`, `worker.ts`).
import { sql } from 'drizzle-orm'
import { BOSS_SCHEMA } from './boss.ts'
import { db, pool } from './db/client.ts'
import { gauge, onCollect } from './metrics.ts'

const poolConnections = gauge('db_pool_connections', 'Подключения пула БД процесса: в работе и свободные')
const queueSize = gauge('jobs_queue_size', 'Готовые к выполнению задачи очереди')
const queueLag = gauge('jobs_lag_seconds', 'Сколько ждёт старейшая готовая задача очереди')

let registered = false

export function registerCoreCollectors() {
	if (registered) return
	registered = true
	onCollect(() => {
		poolConnections.set({ state: 'in_use' }, pool.totalCount - pool.idleCount)
		poolConnections.set({ state: 'idle' }, pool.idleCount)
		poolConnections.set({ state: 'waiting' }, pool.waitingCount)
	})
	onCollect(async () => {
		const { rows } = await db.execute<{ name: string; size: number; lag: number }>(sql`
			select name, count(*)::int as size, coalesce(extract(epoch from now() - min(start_after)), 0)::float8 as lag
			from ${sql.raw(BOSS_SCHEMA)}.job
			where state in ('created', 'retry') and start_after <= now()
			group by name`)
		queueSize.reset()
		queueLag.reset()
		for (const r of rows) {
			queueSize.set({ job: r.name }, r.size)
			queueLag.set({ job: r.name }, r.lag)
		}
	})
}
