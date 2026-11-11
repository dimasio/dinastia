// Фоновые задачи (скилл background-jobs, D-008): defineJob в modules/<m>/jobs.ts, постановка ctx.jobs.send в
// транзакции запроса — откат транзакции отменяет и задачу. Выполняет воркер (src/worker.ts).
import { sql } from 'drizzle-orm'
import { fromDrizzle, type PgBoss, type SendOptions } from 'pg-boss'
import type { z } from 'zod'
import { boss } from './boss.ts'
import type { BaseCtx } from './context.ts'
import type { Tx } from './db/client.ts'
import type { Logger } from './log.ts'

export interface JobDef<D = unknown> {
	/** `<модуль>.<действие>` (kebab-case), неизменяемо: это имя очереди. */
	name: string
	schema: z.ZodType<D>
	/** ctx — транзакция школы задачи (scope 'school') или каждой школы по очереди ('all-schools'). */
	handler: (ctx: BaseCtx, data: D) => unknown
	/** Повторы при сбое (сеть, гонка); ошибка бизнес-правила `fail.*` не повторяется. По умолчанию 3 с нарастанием. */
	retry?: { limit: number; backoff?: boolean }
	/** Сколько секунд может выполняться одна попытка (по умолчанию 300). */
	timeoutSeconds?: number
	/** Не ставить дубль, пока такая же задача ждёт в очереди. */
	singletonKey?: (data: D) => string
	/** Cron по Москве — периодическая задача (данные — `{}`). */
	schedule?: string
	/** 'school' (по умолчанию) — задача одной школы; 'all-schools' — ядро обходит школы, транзакция на школу;
	 * 'global' — задача ядра без школы (`GlobalJobDef`). */
	scope?: 'school' | 'all-schools'
	/**
	 * Выполнять и для неактивной школы (удаляется, приостановлена) — только задачи ядра о жизненном цикле школы (5.5): письма
	 * владельцу об удалении. Остальные задачи такой школы пропускаются.
	 */
	inactiveSchool?: boolean
}

/** Контекст задачи ядра без школы (scope 'global'): таблицы ядра без тенанта — глобальным клиентом БД. */
export interface GlobalCtx {
	now: () => Date
	log: Logger
}

/** Задача ядра без школы (очистка глобальных таблиц). Модулям недоступна: у них всё — в школе. */
export interface GlobalJobDef<D = unknown> extends Omit<JobDef<D>, 'handler' | 'scope'> {
	scope: 'global'
	handler: (ctx: GlobalCtx, data: D) => unknown
}

/** Данные задачи в очереди: школа + данные по схеме (для all-schools — без школы). */
export interface JobPayload {
	schoolId?: string
	data: unknown
}

/** Задача с любыми данными — для реестров и исполнителя (у каждой задачи своя схема). */
// biome-ignore lint/suspicious/noExplicitAny: вариантность: JobDef<{ id }> должен попадать в общий список
export type AnyJob = JobDef<any> | GlobalJobDef<any>

/** Задача школы с любыми данными — её можно поставить из запроса (подписчики событий). */
// biome-ignore lint/suspicious/noExplicitAny: см. AnyJob
export type SchoolJob = JobDef<any>

export const JOB_NAME = /^[a-z][a-z0-9-]*\.[a-z0-9][a-z0-9.-]*$/

export function defineJob<D>(def: GlobalJobDef<D>): GlobalJobDef<D>
export function defineJob<D>(def: JobDef<D>): JobDef<D>
export function defineJob<D>(def: JobDef<D> | GlobalJobDef<D>): JobDef<D> | GlobalJobDef<D> {
	if (!JOB_NAME.test(def.name)) throw new Error(`задача «${def.name}»: имя — <модуль>.<действие> в kebab-case`)
	if (def.schedule && (def.scope ?? 'school') === 'school')
		throw new Error(
			`задача «${def.name}»: расписание только у scope 'all-schools' или 'global' — у задачи школы нет школы`,
		)
	return def
}

export const sendOptions = (def: Pick<JobDef, 'retry' | 'timeoutSeconds'>): SendOptions => ({
	retryLimit: def.retry?.limit ?? 3,
	retryBackoff: def.retry?.backoff ?? true,
	expireInSeconds: def.timeoutSeconds ?? 300,
})

const ensured = new Set<string>()

/** Очередь задачи (создаётся при первой постановке или старте воркера; DML в pgboss.queue, идемпотентно). */
export async function ensureQueue(b: PgBoss, job: Pick<JobDef, 'name' | 'retry' | 'timeoutSeconds'>) {
	if (ensured.has(job.name)) return
	if (!(await b.getQueue(job.name))) await b.createQueue(job.name, sendOptions(job))
	ensured.add(job.name)
}

export interface Jobs {
	/** Поставить задачу школы в текущей транзакции; `startAfter` — отложенный запуск. Вернёт id или null (дубль singletonKey). */
	send<D>(job: JobDef<D>, data: D, opts?: { startAfter?: Date | number }): Promise<string | null>
}

/** ctx.jobs для транзакции школы. */
export function jobsFor(tx: Tx, schoolId: string): Jobs {
	return {
		async send(job, data, opts = {}) {
			if (job.scope === 'all-schools') throw new Error(`задача «${job.name}» обходит все школы — её ставит расписание`)
			const parsed = job.schema.parse(data)
			const payload: JobPayload = { schoolId, data: parsed }
			const b = await boss()
			await ensureQueue(b, job)
			return b.send(job.name, payload as object, {
				...sendOptions(job),
				...(job.singletonKey ? { singletonKey: `${schoolId}:${job.singletonKey(parsed)}` } : {}),
				...(opts.startAfter !== undefined ? { startAfter: opts.startAfter } : {}),
				db: fromDrizzle(tx, sql),
			})
		},
	}
}
