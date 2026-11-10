// Работы на доработке в кабинете ученика (карточка 4.5): только свои «Нужна доработка», после отправки исчезают, отозванный
// курс скрыт, другой школе и сотрудникам без права сдачи не видны.
import { ORPCError } from '@orpc/client'
import { afterAll, describe, expect, it } from 'vitest'
import { pool } from '#/kernel/db/client.ts'
import { cleanupTestSchools, withTestSchool } from '#/test/school.ts'

afterAll(async () => {
	await cleanupTestSchools()
	await pool.end()
})

const doc = (text: string) => ({
	type: 'doc' as const,
	content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})

async function setup() {
	const t = await withTestSchool()
	const c = t.as('teacher')
	const course = await c.courses.create({ title: 'Курс с заданием' })
	const section = await c.courses.sections.create({ courseId: course.id, title: 'Раздел' })
	const lesson = await c.courses.lessons.create({ sectionId: section.id, title: 'Натюрморт' })
	const block = await c.courses.blocks.create({ lessonId: lesson.id, type: 'assignment' })
	await c.courses.blocks.update({ id: block.id, data: { ...block.data, prompt: doc('Нарисуйте натюрморт') } })
	await c.courses.lessons.publish({ id: lesson.id })
	await c.courses.publish({ id: course.id })
	const enrolled = await c.learning.enrollments.enroll({ courseId: course.id, email: t.people.student.email })
	const blockKey = (await c.courses.blocks.list({ lessonId: lesson.id })).find((b) => b.id === block.id)
		?.blockKey as string
	const ref = { lessonId: lesson.id, blockKey }
	const student = t.as('student')
	const sent = await student.assignment.submit({ ...ref, body: doc('Работа'), fileIds: [] })
	const submissionId = sent.submission?.id as string
	await c.assignment.review({ submissionId, decision: 'needs_revision', comment: doc('Добавьте тени') })
	return { t, c, course, lesson, ref, student, submissionId, enrollmentId: enrolled.enrollment?.id as string }
}

describe('на доработке', () => {
	it('ученик видит свою работу на доработке; после отправки — нет', async () => {
		const s = await setup()
		const [row] = await s.student.assignment.revisions()
		expect(row).toMatchObject({
			submissionId: s.submissionId,
			courseId: s.course.id,
			courseTitle: 'Курс с заданием',
			lessonId: s.lesson.id,
			lessonTitle: 'Натюрморт',
		})
		expect(row?.reviewedAt).not.toBeNull()
		await s.student.assignment.submit({ ...s.ref, body: doc('Работа с тенями'), fileIds: [] })
		expect(await s.student.assignment.revisions()).toEqual([])
	})

	it('отозванный курс скрыт; сотруднику — нет права, другой школе — пусто', async () => {
		const s = await setup()
		const denied = await s.t
			.as('curator')
			.assignment.revisions()
			.then(
				() => 'ok',
				(e) => (e instanceof ORPCError ? (e.data as { code?: string }).code : e),
			)
		expect(denied).toBe('NO_PERMISSION')
		const other = await withTestSchool()
		expect(await other.as('student').assignment.revisions()).toEqual([])
		await s.c.learning.enrollments.revoke({ id: s.enrollmentId })
		expect(await s.student.assignment.revisions()).toEqual([])
	})
})
