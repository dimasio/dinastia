// pnpm --filter @dinastia/api exec tsx src/enroll.ts <slug школы> <email ученика> <название курса> [sequential|open|drip]
// Зачисление ученика на курс из командной строки — для разработки и e2e, пока нет экранов зачисления (фаза 4).
// Третий аргумент необязателен: задаёт режим доступа к урокам курса (экран настроек курса — позже).
import { eq } from 'drizzle-orm'
import { users } from './kernel/auth/schema.ts'
import { config } from './kernel/config.ts'
import { db, pool } from './kernel/db/client.ts'
import { withTenant } from './kernel/db/tenant.ts'
import { log } from './kernel/log.ts'
import { members } from './kernel/members/schema.ts'
import { tenantCtx } from './kernel/tenant-ctx.ts'
import { courses } from './modules/courses/schema.ts'
import { enrollMember } from './modules/learning/service.ts'
import { findSchoolBySlug } from './modules/schools/service.ts'

if (config.NODE_ENV === 'production') throw new Error('enroll запрещён в production')

const [slug, email, title, mode] = process.argv.slice(2)
if (!slug || !email || !title) throw new Error('usage: enroll <slug> <email> <название курса> [sequential|open|drip]')
const school = await findSchoolBySlug(slug)
if (!school) throw new Error(`школа «${slug}» не найдена`)
const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email))
if (!user) throw new Error(`пользователь ${email} не найден`)

await withTenant(school.id, async (tx) => {
	const [member] = await tx.select().from(members).where(eq(members.userId, user.id))
	const [course] = await tx.select().from(courses).where(eq(courses.title, title))
	if (!member || !course) throw new Error('участник или курс не найден')
	if (mode === 'open' || mode === 'sequential' || mode === 'drip')
		await tx.update(courses).set({ defaultAccessMode: mode }).where(eq(courses.id, course.id))
	await enrollMember(tenantCtx(tx, school, { now: () => new Date(), log }), {
		memberId: member.id,
		courseId: course.id,
	})
})
await pool.end()
console.log(`enroll — ok: ${email} → «${title}»${mode ? ` (${mode})` : ''}`)
