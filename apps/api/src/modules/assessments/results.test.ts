// Результаты тестов и заданий курса (карточка 4.6): лучшая попытка, ожидание ручной проверки, статусы заданий, порядок уроков,
// отозванные не считаются, права.

import { randomUUID } from 'node:crypto'
import { ORPCError } from '@orpc/client'
import { afterAll, describe, expect, it } from 'vitest'
import { pool } from '#/kernel/db/client.ts'
import { withTenant } from '#/kernel/db/tenant.ts'
import { cleanupTestSchools, withTestSchool } from '#/test/school.ts'
import { quizAttempts, submissions } from './schema.ts'

afterAll(async () => {
	await cleanupTestSchools()
	await pool.end()
})

const failure = (e: unknown) => (e instanceof ORPCError ? (e.data as { code?: string }).code : e)
const fails = (p: Promise<unknown>) => p.then(() => 'ok', failure)
const doc = (text: string) => ({
	type: 'doc' as const,
	content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})

/** Курс из двух опубликованных уроков; попытки и сдачи пишутся прямо в таблицы (сервис их только читает). */
async function setup() {
	const t = await withTestSchool()
	const c = t.as('teacher')
	const course = await c.courses.create({ title: 'Результаты' })
	const section = await c.courses.sections.create({ courseId: course.id, title: 'Раздел' })
	const lessons: { id: string }[] = []
	for (const title of ['Тест по теории', 'Практика']) {
		const lesson = await c.courses.lessons.create({ sectionId: section.id, title })
		const block = await c.courses.blocks.create({ lessonId: lesson.id, type: 'text' })
		await c.courses.blocks.update({ id: block.id, data: { body: doc(title) } })
		await c.courses.lessons.publish({ id: lesson.id })
		lessons.push(lesson)
	}
	await c.courses.publish({ id: course.id })
	const enrolled = await c.learning.enrollments.enroll({ courseId: course.id, email: t.people.student.email })
	return { t, c, course, lessons, enrollmentId: enrolled.enrollment?.id as string }
}

describe('результаты курса', () => {
	it('тест — по лучшей попытке, ждущие проверки; задания — по статусам; порядок уроков', async () => {
		const s = await setup()
		const quizKey = randomUUID()
		const workKey = randomUUID()
		const [quizLesson, workLesson] = s.lessons.map((l) => l.id) as [string, string]
		await withTenant(s.t.school.id, async (tx) => {
			await tx.insert(quizAttempts).values([
				{
					enrollmentId: s.enrollmentId,
					lessonId: quizLesson,
					blockKey: quizKey,
					status: 'graded',
					score: 4,
					maxScore: 10,
					passed: false,
				},
				{
					enrollmentId: s.enrollmentId,
					lessonId: quizLesson,
					blockKey: quizKey,
					status: 'graded',
					score: 9,
					maxScore: 10,
					passed: true,
				},
				{ enrollmentId: s.enrollmentId, lessonId: quizLesson, blockKey: quizKey, status: 'in_progress' },
			])
			await tx.insert(submissions).values({
				enrollmentId: s.enrollmentId,
				lessonId: workLesson,
				blockKey: workKey,
				status: 'needs_revision',
				revision: 1,
			})
		})
		const r = await s.c.assessments.results.course({ courseId: s.course.id })
		expect(r.quizzes).toEqual([
			{
				lessonId: quizLesson,
				lessonTitle: 'Тест по теории',
				blockKey: quizKey,
				students: 1,
				passed: 1,
				avgBestPct: 90,
				avgAttempts: 2,
				pendingReview: 0,
			},
		])
		expect(r.assignments).toEqual([
			{
				lessonId: workLesson,
				lessonTitle: 'Практика',
				blockKey: workKey,
				submitted: 1,
				accepted: 0,
				needsRevision: 1,
				rejected: 0,
				pending: 0,
			},
		])
		await s.c.learning.enrollments.revoke({ id: s.enrollmentId })
		expect(await s.c.assessments.results.course({ courseId: s.course.id })).toEqual({ quizzes: [], assignments: [] })
	})

	it('права: ученик — нет; куратор без потоков — пусто; чужая школа — курс не найден', async () => {
		const s = await setup()
		await withTenant(s.t.school.id, (tx) =>
			tx.insert(quizAttempts).values({
				enrollmentId: s.enrollmentId,
				lessonId: s.lessons[0]?.id as string,
				blockKey: randomUUID(),
				status: 'submitted',
			}),
		)
		expect((await s.c.assessments.results.course({ courseId: s.course.id })).quizzes[0]).toMatchObject({
			pendingReview: 1,
			avgBestPct: null,
		})
		expect((await s.t.as('curator').assessments.results.course({ courseId: s.course.id })).quizzes).toEqual([])
		expect(await fails(s.t.as('student').assessments.results.course({ courseId: s.course.id }))).toBe('NO_PERMISSION')
		const other = await withTestSchool()
		expect(await fails(other.as('teacher').assessments.results.course({ courseId: s.course.id }))).toBe(
			'COURSE_NOT_FOUND',
		)
	})
})
