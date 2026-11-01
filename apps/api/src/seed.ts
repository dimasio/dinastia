// pnpm db:seed — демо-данные для локальной разработки (скилл local-env). Идёт через сервисы, а не прямыми вставками.
// Идемпотентен: существующих пользователей и школы не трогает.
import type { MemberRole } from '@dinastia/contracts/schools'
import { eq } from 'drizzle-orm'
import { auth } from './kernel/auth/auth.ts'
import { users } from './kernel/auth/schema.ts'
import { config } from './kernel/config.ts'
import type { SchoolCtx } from './kernel/context.ts'
import { db, pool } from './kernel/db/client.ts'
import { withTenant } from './kernel/db/tenant.ts'
import { log } from './kernel/log.ts'
import { members } from './kernel/members/schema.ts'
import { tenantCtx } from './kernel/tenant-ctx.ts'
import { courses } from './modules/courses/schema.ts'
import { createCourse, createLesson, createSection } from './modules/courses/service.ts'
import { createSchool, findSchoolBySlug } from './modules/schools/service.ts'

const PASSWORD = 'demo12345'

if (config.NODE_ENV === 'production') throw new Error('db:seed запрещён в production')

async function ensureUser(email: string, name: string) {
	const [found] = await db.select({ id: users.id }).from(users).where(eq(users.email, email))
	if (found) return found.id
	const res = await auth.api.signUpEmail({ body: { email, password: PASSWORD, name } })
	await db.update(users).set({ emailVerified: true }).where(eq(users.id, res.user.id))
	return res.user.id
}

async function ensureSchool(slug: string, name: string, ownerEmail: string, ownerName: string) {
	const ownerId = await ensureUser(ownerEmail, ownerName)
	return (await findSchoolBySlug(slug)) ?? (await createSchool({ slug, name }, { userId: ownerId })).school
}

async function ensureMember(schoolId: string, userId: string, role: MemberRole) {
	await withTenant(schoolId, (tx) =>
		tx
			.insert(members)
			.values({ userId, role })
			.onConflictDoNothing({ target: [members.schoolId, members.userId] }),
	)
}

const demo = await ensureSchool('demo', 'Демо-школа', 'owner@demo.local', 'Ольга Владелец')
const staff: [string, string, MemberRole][] = [
	['admin@demo.local', 'Алексей Админ', 'admin'],
	['teacher@demo.local', 'Татьяна Преподаватель', 'teacher'],
	['curator@demo.local', 'Кирилл Куратор', 'curator'],
	['student1@demo.local', 'Ученик Первый', 'student'],
	['student2@demo.local', 'Ученица Вторая', 'student'],
	['student3@demo.local', 'Ученик Третий', 'student'],
	['student4@demo.local', 'Ученица Четвёртая', 'student'],
	['student5@demo.local', 'Ученик Пятый', 'student'],
]
for (const [email, name, role] of staff) await ensureMember(demo.id, await ensureUser(email, name), role)

// Демо-курс преподавателя: 2 раздела, 3 урока (содержимое уроков — с конструктором урока, 2.3).
const teacherId = await ensureUser('teacher@demo.local', 'Татьяна Преподаватель')
await withTenant(demo.id, async (tx) => {
	const [exists] = await tx.select({ id: courses.id }).from(courses).where(eq(courses.slug, 'osnovy-akvareli'))
	if (exists) return
	const [teacher] = await tx.select().from(members).where(eq(members.userId, teacherId))
	if (!teacher) throw new Error('нет преподавателя демо-школы')
	// сервисы курса — от участника-преподавателя, как из его запроса
	const ctx: SchoolCtx = {
		...tenantCtx(tx, demo, { now: () => new Date(), log }),
		user: { id: teacherId, email: 'teacher@demo.local', name: 'Татьяна Преподаватель' },
		member: { id: teacher.id, role: 'teacher' },
		can: () => true,
	}
	const course = await createCourse(ctx, { title: 'Основы акварели' })
	const basics = await createSection(ctx, { courseId: course.id, title: 'Материалы и инструменты' })
	await createLesson(ctx, { sectionId: basics.id, title: 'Бумага, кисти, краски' })
	await createLesson(ctx, { sectionId: basics.id, title: 'Палитра и смешивание цветов' })
	const practice = await createSection(ctx, { courseId: course.id, title: 'Первые работы' })
	await createLesson(ctx, { sectionId: practice.id, title: 'Заливка и растяжка' })
})

// Вторая школа — для проверки изоляции; teacher@demo.local здесь ученик (один человек — разные роли).
const other = await ensureSchool('other', 'Другая школа', 'owner@other.local', 'Олег Другой')
await ensureMember(other.id, await ensureUser('teacher@demo.local', 'Татьяна Преподаватель'), 'student')

console.log(`db:seed — ok: школы demo, other; демо-курс «Основы акварели»; пароль у всех — ${PASSWORD}`)
await pool.end()
