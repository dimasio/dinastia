// Выполнение задач (скилл background-jobs): данные по схеме → контекст школы → handler; исход — для pg-boss.
// Ошибка бизнес-правила (fail.*) и битые данные повтором не исправить — задача завершается сразу (deadletter);
// остальное — повтор по retry задачи.
import type { JobResult, PgBoss } from 'pg-boss'
import { ZodError } from 'zod'
import { withTenant } from './db/tenant.ts'
import { AppError } from './errors.ts'
import { type AnyJob, type JobPayload, sendOptions } from './jobs.ts'
import { log as rootLog } from './log.ts'
import { allJobs } from './registry.ts'
import { activeSchool, forEachSchool, tenantCtx } from './tenant-ctx.ts'

export type JobOutcome = JobResult['status']

const permanent = (error: unknown) => error instanceof AppError || error instanceof ZodError

/** Выполнить одну задачу; бросает только ошибку, которую стоит повторить. */
export async function runJob(def: AnyJob, payload: JobPayload, meta: { jobId: string; now?: () => Date }) {
	const now = meta.now ?? (() => new Date())
	const log = rootLog.child({
		job: def.name,
		jobId: meta.jobId,
		...(payload.schoolId ? { schoolId: payload.schoolId } : {}),
	})
	const data = def.schema.parse(payload.data)

	if (def.scope === 'all-schools') {
		const errors = await forEachSchool((ctx) => def.handler(ctx, data), { now, log })
		const retryable = errors.find((e) => !permanent(e.error))
		if (retryable) throw retryable.error
		return
	}
	if (!payload.schoolId) throw new AppError('invalid', 'JOB_WITHOUT_SCHOOL')
	const school = await activeSchool(payload.schoolId)
	if (!school) {
		log.warn('school is not active, job skipped')
		return
	}
	await withTenant(school.id, (tx) => Promise.resolve(def.handler(tenantCtx(tx, school, { now, log }), data)))
}

/** Исход задачи для pg-boss: completed / failed (повтор) / deadletter (без повтора). */
export async function settle(def: AnyJob, payload: JobPayload, meta: { jobId: string; now?: () => Date }) {
	try {
		await runJob(def, payload, meta)
		return { status: 'completed' as JobOutcome }
	} catch (error) {
		const terminal = permanent(error)
		rootLog[terminal ? 'warn' : 'error'](
			{ err: error, job: def.name, jobId: meta.jobId, schoolId: payload.schoolId },
			terminal ? 'job failed permanently' : 'job failed, will retry',
		)
		const output = { error: error instanceof AppError ? error.code : error instanceof Error ? error.message : 'error' }
		return { status: (terminal ? 'deadletter' : 'failed') as JobOutcome, output }
	}
}

/** Очереди всех задач реестра (создание — DML в pgboss.queue, идемпотентно). */
export async function ensureQueues(b: PgBoss, jobs = allJobs()) {
	const existing = new Set((await b.getQueues()).map((q) => q.name))
	for (const job of jobs) if (!existing.has(job.name)) await b.createQueue(job.name, sendOptions(job))
}

/** Запустить обработчики всех очередей и расписания; вернёт функцию остановки обработчиков. */
export async function startWorkers(b: PgBoss, opts: { pollingIntervalSeconds?: number } = {}) {
	const jobs = allJobs()
	await ensureQueues(b, jobs)
	for (const job of jobs) {
		await b.work<JobPayload>(
			job.name,
			{ perJobResults: true, batchSize: 1, pollingIntervalSeconds: opts.pollingIntervalSeconds ?? 2 },
			async (batch) =>
				Promise.all(batch.map(async (j) => ({ id: j.id, ...(await settle(job, j.data, { jobId: j.id })) }))),
		)
		if (job.schedule) await b.schedule(job.name, job.schedule, { data: {} }, { tz: 'Europe/Moscow' })
		else await b.unschedule(job.name)
	}
	return async () => {
		for (const job of jobs) await b.offWork(job.name)
	}
}
