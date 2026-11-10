// pnpm --filter @dinastia/api exec tsx src/enroll.ts <slug школы> <email ученика> <название курса> [sequential|open|drip]
//   [email куратора]
// Зачисление ученика на курс из командной строки — для сидов и e2e. Режим доступа к урокам необязателен (экран настроек
// курса — позже). Почта куратора — ученик попадает в поток «Поток куратора» этого курса с этим куратором (4.2: куратор
// видит только свои потоки); поток создаётся, если его нет.
import { and, eq } from 'drizzle-orm'
import { users } from './kernel/auth/schema.ts'
import { config } from './kernel/config.ts'
import { db, pool } from './kernel/db/client.ts'
import { withTenant } from './kernel/db/tenant.ts'
import { log } from './kernel/log.ts'
import { members } from './kernel/members/schema.ts'
import { tenantCtx } from './kernel/tenant-ctx.ts'
import { courses } from './modules/courses/schema.ts'
import { enrollments, groupCurators, groups } from './modules/learning/schema.ts'
import { enrollMember } from './modules/learning/service.ts'
import { findSchoolBySlug } from './modules/schools/service.ts'

if (config.NODE_ENV === 'production') throw new Error('enroll запрещён в production')

const [slug, email, title, mode, curatorEmail] = process.argv.slice(2)
if (!slug || !email || !title)
	throw new Error('usage: enroll <slug> <email> <название курса> [sequential|open|drip] [email куратора]')
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
	const enrollment = await enrollMember(tenantCtx(tx, school, { now: () => new Date(), log }), {
		memberId: member.id,
		courseId: course.id,
	})
	if (!curatorEmail) return
	const [curator] = await tx
		.select({ id: members.id })
		.from(members)
		.innerJoin(users, eq(users.id, members.userId))
		.where(eq(users.email, curatorEmail))
	if (!curator) throw new Error(`куратор ${curatorEmail} не найден`)
	const name = 'Поток куратора'
	const [found] = await tx
		.select()
		.from(groups)
		.where(and(eq(groups.courseId, course.id), eq(groups.title, name)))
	const group = found ?? (await tx.insert(groups).values({ courseId: course.id, title: name }).returning())[0]
	if (!group) throw new Error('поток не создан')
	await tx.insert(groupCurators).values({ groupId: group.id, memberId: curator.id }).onConflictDoNothing()
	await tx.update(enrollments).set({ groupId: group.id }).where(eq(enrollments.id, enrollment.id))
})
await pool.end()
console.log(
	`enroll — ok: ${email} → «${title}»${mode ? ` (${mode})` : ''}${curatorEmail ? `, куратор ${curatorEmail}` : ''}`,
)
