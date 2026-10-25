// Доменные события (скилл events-automations, D-045): defineEvent в modules/<m>/events.ts, подписчики on() в модуле,
// которому нужна реакция. ctx.emit ставит по задаче на каждого подписчика в транзакции запроса — это и есть outbox:
// откат — события не было, коммит — подписчики выполнятся воркером (асинхронно, с повторами).
import type { z } from 'zod'
import type { BaseCtx } from './context.ts'
import type { Tx } from './db/client.ts'
import { type AnyJob, type JobDef, jobsFor } from './jobs.ts'
import { subscribersOf } from './registry.ts'

export interface EventDef<D = unknown> {
	/** `<сущность>.<что произошло>` в прошедшем времени (`lesson.completed`), неизменяемо. */
	name: string
	schema: z.ZodType<D>
}

export const EVENT_NAME = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/

export function defineEvent<D>(name: string, schema: z.ZodType<D>): EventDef<D> {
	if (!EVENT_NAME.test(name)) throw new Error(`событие «${name}»: имя — <сущность>.<прошедшее_время> (snake_case)`)
	return { name, schema }
}

export interface Subscriber<D = unknown> {
	event: EventDef<D>
	handler: (ctx: BaseCtx, data: D) => unknown
	/** Различает двух подписчиков модуля на одно событие (имя задачи `<модуль>.on.<событие>.<key>`). */
	key?: string
	retry?: JobDef['retry']
}

/** Подписчик: выполняется задачей после коммита; должен быть идемпотентным (повтор не удваивает эффект). */
export function on<D>(
	event: EventDef<D>,
	handler: Subscriber<D>['handler'],
	opts: Pick<Subscriber<D>, 'key' | 'retry'> = {},
): Subscriber<D> {
	return { event, handler, ...opts }
}

/** Задача подписчика модуля (собирает реестр модулей). */
// biome-ignore lint/suspicious/noExplicitAny: подписчик любого события
export function subscriberJob(module: string, s: Subscriber<any>): AnyJob {
	return {
		name: `${module}.on.${s.event.name.replaceAll('_', '-')}${s.key ? `.${s.key}` : ''}`,
		schema: s.event.schema,
		handler: s.handler,
		...(s.retry ? { retry: s.retry } : {}),
	}
}

export type Emit = <D>(event: EventDef<D>, data: D) => Promise<void>

/** ctx.emit для транзакции школы. */
export function emitFor(tx: Tx, schoolId: string): Emit {
	const jobs = jobsFor(tx, schoolId)
	return async (event, data) => {
		const parsed = event.schema.parse(data)
		for (const job of subscribersOf(event.name)) await jobs.send(job, parsed)
	}
}
