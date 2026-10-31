// Rate limit процедур (скилл security-baseline): .use(rateLimit({ name, max, windowSeconds, by })) после того звена
// цепочки, которое даёт субъекта (mw.session — user, mw.member — member). Попытка считается и при ошибке процедуры:
// счётчик пишется вне транзакции запроса.
import { createHash } from 'node:crypto'
import { ORPCError, os } from '@orpc/server'
import { lt, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/client.ts'
import { defineJob } from '../jobs.ts'
import type { RequestCtx } from '../orpc.ts'
import { requestLimits } from './schema.ts'

/** Дольше суток окна не бывает — задача очистки удаляет окна старше суток. */
const MAX_WINDOW_SECONDS = 24 * 60 * 60

export interface RateLimitDef {
	/** Имя лимита: `<модуль>.<действие>` — `schools.invite`. */
	name: string
	/** Сколько запросов в окне. */
	max: number
	windowSeconds: number
	/** Кого считаем: IP клиента (ядро, D-042), пользователя (после mw.session) или участника школы (после mw.member). */
	by: 'ip' | 'user' | 'member'
}

type LimitCtx = RequestCtx & {
	user?: { id: string }
	member?: { id: string }
	school?: { id: string }
}

function subjectOf(def: RateLimitDef, c: LimitCtx): string {
	if (def.by === 'member') {
		if (!c.member || !c.school) throw new Error(`rate limit «${def.name}»: by member — после mw.member`)
		return `member:${c.school.id}:${c.member.id}`
	}
	if (def.by === 'user') {
		if (!c.user) throw new Error(`rate limit «${def.name}»: by user — после mw.session`)
		return `user:${c.user.id}`
	}
	return `ip:${c.school?.id ?? ''}:${c.ip ?? 'unknown'}`
}

/** Засчитать попытку; вернёт номер попытки в окне и сколько секунд до конца окна. */
export async function hit(def: RateLimitDef, subject: string, now: Date) {
	const windowMs = def.windowSeconds * 1000
	const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs)
	const key = `${def.name}:${createHash('sha256').update(subject).digest('hex')}`
	const [row] = await db
		.insert(requestLimits)
		.values({ key, windowStart, count: 1 })
		.onConflictDoUpdate({
			target: requestLimits.key,
			set: {
				count: sql`case when ${requestLimits.windowStart} = excluded.window_start then ${requestLimits.count} + 1 else 1 end`,
				windowStart: sql`excluded.window_start`,
			},
		})
		.returning({ count: requestLimits.count })
	const retryAfter = Math.max(1, Math.ceil((windowStart.getTime() + windowMs - now.getTime()) / 1000))
	return { count: row?.count ?? 1, retryAfter }
}

export function rateLimit(def: RateLimitDef) {
	if (def.windowSeconds < 1 || def.windowSeconds > MAX_WINDOW_SECONDS)
		throw new Error(`rate limit «${def.name}»: окно от 1 с до суток`)
	if (def.max < 1) throw new Error(`rate limit «${def.name}»: max ≥ 1`)
	return os.$context<LimitCtx>().middleware(async ({ context, next }) => {
		const { count, retryAfter } = await hit(def, subjectOf(def, context), context.now())
		if (count > def.max) {
			context.log.warn({ limit: def.name, by: def.by }, 'rate limited')
			throw new ORPCError('TOO_MANY_REQUESTS', {
				message: 'RATE_LIMITED',
				data: { code: 'RATE_LIMITED', retryAfter },
			})
		}
		return next()
	})
}

/** Очистка: окна старше суток уже не действуют (раз в час). */
export const requestLimitsCleanupJob = defineJob({
	name: 'rate-limit.cleanup',
	schema: z.object({}),
	scope: 'global',
	schedule: '23 * * * *',
	async handler(ctx) {
		const before = new Date(ctx.now().getTime() - MAX_WINDOW_SECONDS * 1000)
		const deleted = await db
			.delete(requestLimits)
			.where(lt(requestLimits.windowStart, before))
			.returning({ key: requestLimits.key })
		ctx.log.info({ deleted: deleted.length }, 'request limits cleaned')
	},
})
