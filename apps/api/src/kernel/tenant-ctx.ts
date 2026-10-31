// Контекст школы для сервисов — один и тот же у процедуры и у задачи (BaseCtx): транзакция, школа, время, лог,
// события, задачи, письма, файлы и журнал в этой транзакции.
import { schools } from '@dinastia/db'
import { eq } from 'drizzle-orm'
import { auditFor } from './audit/audit.ts'
import type { BaseCtx } from './context.ts'
import { db, type Tx } from './db/client.ts'
import { withTenant } from './db/tenant.ts'
import { emitFor } from './events.ts'
import { createHttp } from './http.ts'
import { jobsFor } from './jobs.ts'
import type { Logger } from './log.ts'
import { mailFor } from './mail/send.ts'
import { settingsFor } from './settings/settings.ts'
import { filesFor } from './storage/files.ts'

export function tenantCtx(tx: Tx, school: BaseCtx['school'], env: { now: () => Date; log: Logger }): BaseCtx {
	const jobs = jobsFor(tx, school.id)
	return {
		db: tx,
		school,
		now: env.now,
		log: env.log,
		emit: emitFor(tx, school.id),
		jobs,
		mail: mailFor(jobs),
		files: filesFor(tx, jobs),
		audit: auditFor(tx, { memberId: null }),
		http: createHttp({ log: env.log }),
		settings: settingsFor(tx),
	}
}

/** Активная школа по id (задачи: школу могли приостановить или удалить, пока задача ждала). */
export async function activeSchool(id: string): Promise<BaseCtx['school'] | null> {
	const [row] = await db.select().from(schools).where(eq(schools.id, id)).limit(1)
	return row?.status === 'active' ? { id: row.id, slug: row.slug, name: row.name } : null
}

/**
 * Выполнить fn для каждой активной школы — своя транзакция на школу (скилл background-jobs, scope 'all-schools').
 * Ошибка одной школы не останавливает остальные; вернёт ошибки по школам.
 */
export async function forEachSchool(
	fn: (ctx: BaseCtx) => unknown,
	env: { now: () => Date; log: Logger },
): Promise<{ schoolId: string; error: unknown }[]> {
	const rows = await db
		.select({ id: schools.id, slug: schools.slug, name: schools.name })
		.from(schools)
		.where(eq(schools.status, 'active'))
	const errors: { schoolId: string; error: unknown }[] = []
	for (const school of rows) {
		const log = env.log.child({ schoolId: school.id })
		try {
			await withTenant(school.id, (tx) => Promise.resolve(fn(tenantCtx(tx, school, { now: env.now, log }))))
		} catch (error) {
			log.error({ err: error }, 'school failed in all-schools job')
			errors.push({ schoolId: school.id, error })
		}
	}
	return errors
}
