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
import { addLessonBlock, listLessonBlocks, updateLessonBlock } from './modules/courses/blocks.service.ts'
import { publishCourse, publishLesson } from './modules/courses/publish.service.ts'
import { courses, lessons } from './modules/courses/schema.ts'
import { createCourse, createLesson, createSection } from './modules/courses/service.ts'
import { enrollMember } from './modules/learning/service.ts'
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
	// для e2e «Сотрудники»: роль и блокировку меняют ему, а не общему куратору (иначе параллельные сценарии теряют доступ)
	['curator2@demo.local', 'Лев Куратор', 'curator'],
	['student1@demo.local', 'Ученик Первый', 'student'],
	['student2@demo.local', 'Ученица Вторая', 'student'],
	['student3@demo.local', 'Ученик Третий', 'student'],
	['student4@demo.local', 'Ученица Четвёртая', 'student'],
	['student5@demo.local', 'Ученик Пятый', 'student'],
]
for (const [email, name, role] of staff) await ensureMember(demo.id, await ensureUser(email, name), role)

// Демо-курс преподавателя: 2 раздела, 3 урока, в первом — выноска.
const teacherId = await ensureUser('teacher@demo.local', 'Татьяна Преподаватель')
await withTenant(demo.id, async (tx) => {
	const [teacher] = await tx.select().from(members).where(eq(members.userId, teacherId))
	if (!teacher) throw new Error('нет преподавателя демо-школы')
	// сервисы курса — от участника-преподавателя, как из его запроса
	const ctx: SchoolCtx = {
		...tenantCtx(tx, demo, { now: () => new Date(), log }),
		user: { id: teacherId, email: 'teacher@demo.local', name: 'Татьяна Преподаватель' },
		member: { id: teacher.id, role: 'teacher' },
		can: () => true,
	}
	const [exists] = await tx.select({ id: courses.id }).from(courses).where(eq(courses.slug, 'osnovy-akvareli'))
	if (!exists) {
		const course = await createCourse(ctx, { title: 'Основы акварели' })
		const basics = await createSection(ctx, { courseId: course.id, title: 'Материалы и инструменты' })
		await createLesson(ctx, { sectionId: basics.id, title: 'Бумага, кисти, краски' })
		await createLesson(ctx, { sectionId: basics.id, title: 'Палитра и смешивание цветов' })
		const practice = await createSection(ctx, { courseId: course.id, title: 'Первые работы' })
		await createLesson(ctx, { sectionId: practice.id, title: 'Заливка и растяжка' })
	}
	// первый урок — с выноской (2.3); отдельным шагом, чтобы дополнить и ранее засеянную базу
	const [paper] = await tx.select({ id: lessons.id }).from(lessons).where(eq(lessons.title, 'Бумага, кисти, краски'))
	if (paper && (await listLessonBlocks(ctx, paper.id)).length === 0) {
		const tip = await addLessonBlock(ctx, { lessonId: paper.id, type: 'callout' })
		const text = 'Возьмите бумагу плотностью от 200 г/м² — она не коробится от воды.'
		await updateLessonBlock(ctx, {
			id: tip.id,
			data: {
				tone: 'success',
				body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
			},
		})
	}

	// 2.6: уроки с текстом опубликованы, курс — последовательный, student1 зачислен (демо плеера ученика)
	const [course] = await tx.select().from(courses).where(eq(courses.slug, 'osnovy-akvareli'))
	if (course) {
		const list = await tx.select().from(lessons).where(eq(lessons.courseId, course.id))
		for (const lesson of list) {
			if ((await listLessonBlocks(ctx, lesson.id)).every((b) => b.type !== 'text')) {
				const body = await addLessonBlock(ctx, { lessonId: lesson.id, type: 'text' })
				const line = `Конспект урока «${lesson.title}».`
				const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: line }] }] }
				await updateLessonBlock(ctx, { id: body.id, data: { body: doc } })
			}
			if (!lesson.publishedAt) await publishLesson(ctx, lesson.id)
		}
		await tx.update(courses).set({ defaultAccessMode: 'sequential' }).where(eq(courses.id, course.id))
		if (course.status === 'draft') await publishCourse(ctx, course.id)
		const studentUser = await ensureUser('student1@demo.local', 'Ученик Первый')
		const [student] = await tx.select().from(members).where(eq(members.userId, studentUser))
		if (student) await enrollMember(ctx, { memberId: student.id, courseId: course.id })
	}
})

// Вторая школа — для проверки изоляции; teacher@demo.local здесь ученик (один человек — разные роли).
const other = await ensureSchool('other', 'Другая школа', 'owner@other.local', 'Олег Другой')
await ensureMember(other.id, await ensureUser('teacher@demo.local', 'Татьяна Преподаватель'), 'student')

console.log(`db:seed — ok: школы demo, other; демо-курс «Основы акварели»; пароль у всех — ${PASSWORD}`)
await pool.end()
