// Доступ поддержки Dinastia (5.6г): owner/admin открывает на 7 дней — оператор может войти от имени участника (не владельца);
// закрыть можно раньше — сессии «от имени» в школе отзываются сразу. Каждое изменение — в журнал школы.
import { schools } from '@dinastia/db'
import { eq } from 'drizzle-orm'
import type { SchoolCtx } from '#/kernel/context.ts'
import { revokeImpersonations, SUPPORT_ACCESS_DAYS } from '#/kernel/ops/impersonation.ts'

export async function getSupportAccess(ctx: Pick<SchoolCtx, 'db' | 'school' | 'now'>) {
	const [row] = await ctx.db
		.select({ until: schools.supportAccessUntil })
		.from(schools)
		.where(eq(schools.id, ctx.school.id))
	const until = row?.until && row.until > ctx.now() ? row.until : null
	return { until }
}

export async function setSupportAccess(ctx: SchoolCtx, open: boolean) {
	const until = open ? new Date(ctx.now().getTime() + SUPPORT_ACCESS_DAYS * 24 * 60 * 60 * 1000) : null
	await ctx.db.update(schools).set({ supportAccessUntil: until }).where(eq(schools.id, ctx.school.id))
	if (!open) await revokeImpersonations(ctx.school.id)
	await ctx.audit(`schools.support-access.${open ? 'opened' : 'closed'}`, {
		entity: 'school',
		id: ctx.school.id,
		...(until ? { diff: { until: until.toISOString() } } : {}),
	})
	return { until }
}
