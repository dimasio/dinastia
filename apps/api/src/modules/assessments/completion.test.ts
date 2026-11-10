// Завершение урока по результату (карточка 3.6): правило `all_blocks` — тест сдан с зачётом и задание принято; `view` и `manual`
// без изменений; `done` не снимается; отклонённая работа урок не завершает; переключатель правила (`lessons.update`) и права.
import { questionTypes } from '@dinastia/questions'
import { ORPCError } from '@orpc/client'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { pool } from '#/kernel/db/client.ts'
import { withTenant } from '#/kernel/db/tenant.ts'
import { log } from '#/kernel/log.ts'
import { members } from '#/kernel/members/schema.ts'
import { tenantCtx } from '#/kernel/tenant-ctx.ts'
import { cleanupTestSchools, withTestSchool } from '#/test/school.ts'
import { enrollMember } from '../learning/service.ts'
import { intoCuratorGroup } from '../learning/testing.ts'

afterAll(async () => {
	await cleanupTestSchools()
	await pool.end()
})

const failure = (e: unknown) => (e instanceof ORPCError ? (e.data as { code?: string }) : e)
const fails = (p: Promise<unknown>) => p.then(() => 'ok', failure)
const doc = (text: string) => ({
	type: 'doc' as const,
	content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})

interface Opts {
	quiz?: boolean
	assignment?: boolean
	assignmentSettings?: Record<string, unknown>
	quizSettings?: Record<string, unknown>
}

/** Курс с одним уроком (правило по умолчанию) и блоками «оценки» по выбору; ученик зачислен. */
async function setup(opts: Opts) {
	const t = await withTestSchool()
	const c = t.as('teacher')
	const course = await c.courses.create({ title: 'Курс с результатами' })
	const section = await c.courses.sections.create({ courseId: course.id, title: 'Раздел' })
	const lesson = await c.courses.lessons.create({ sectionId: section.id, title: 'Урок' })
	let quizKey = ''
	let assignmentKey = ''
	let right = ''
	let wrong = ''
	await c.courses.blocks.create({ lessonId: lesson.id, type: 'text' }).then(async (b) => {
		await c.courses.blocks.update({ id: b.id, data: { body: doc('Теория') } })
	})
	if (opts.quiz) {
		const q = await c.assessments.questions.create({
			courseId: course.id,
			type: 'single_choice',
			data: questionTypes.single_choice.example() as Record<string, unknown>,
			tags: [],
		})
		const stored = await c.assessments.questions.get({ id: q.id })
		const options = stored.data.options as { id: string; isCorrect: boolean }[]
		right = options.find((o) => o.isCorrect)?.id as string
		wrong = options.find((o) => !o.isCorrect)?.id as string
		const block = await c.courses.blocks.create({ lessonId: lesson.id, type: 'quiz' })
		await c.courses.blocks.update({
			id: block.id,
			data: { ...block.data, questions: [{ questionId: q.id }], ...opts.quizSettings },
		})
		quizKey = (await c.courses.blocks.list({ lessonId: lesson.id })).find((b) => b.id === block.id)?.blockKey as string
	}
	if (opts.assignment) {
		const block = await c.courses.blocks.create({ lessonId: lesson.id, type: 'assignment' })
		await c.courses.blocks.update({
			id: block.id,
			data: { ...block.data, prompt: doc('Задание'), ...opts.assignmentSettings },
		})
		assignmentKey = (await c.courses.blocks.list({ lessonId: lesson.id })).find((b) => b.id === block.id)
			?.blockKey as string
	}
	await c.courses.lessons.publish({ id: lesson.id })
	await c.courses.publish({ id: course.id })
	await withTenant(t.school.id, async (tx) => {
		const [m] = await tx.select().from(members).where(eq(members.userId, t.people.student.id))
		await enrollMember(tenantCtx(tx, t.school, { now: () => new Date(), log }), {
			memberId: (m as { id: string }).id,
			courseId: course.id,
		})
	})
	// куратор проверяет только свои потоки (4.2)
	await intoCuratorGroup(t, course.id)
	const student = t.as('student')
	const status = async () => (await student.learn.courses.get({ courseId: course.id })).sections[0]?.lessons[0]?.status
	const progress = async () => (await student.learn.courses.get({ courseId: course.id })).course.progressPct
	const quizRef = { lessonId: lesson.id, blockKey: quizKey }
	const asgRef = { lessonId: lesson.id, blockKey: assignmentKey }
	/** Пройти тест: верно или неверно; вернёт результат. */
	const takeQuiz = async (answer: 'right' | 'wrong') => {
		const view = await student.quiz.start(quizRef)
		await student.quiz.answer({
			attemptId: view.attempt.id,
			attemptQuestionId: view.questions[0]?.id as string,
			response: { selected: answer === 'right' ? right : wrong },
		})
		return student.quiz.submit({ attemptId: view.attempt.id })
	}
	const submitWork = async () =>
		(await student.assignment.submit({ ...asgRef, body: doc('Моя работа'), fileIds: [] })).submission?.id as string
	return { t, c, course, lesson, student, status, progress, takeQuiz, submitWork, asgRef, quizRef }
}

describe('завершение урока по результату (all_blocks)', () => {
	it('новый урок — правило «по заданиям и тестам»; урок без блоков «оценки» завершается при открытии', async () => {
		const s = await setup({})
		expect((await s.c.courses.lessons.get({ id: s.lesson.id })).completionRule).toBe('all_blocks')
		expect(await s.status()).toBe('available')
		await s.student.learn.lessons.open({ lessonId: s.lesson.id })
		expect(await s.status()).toBe('completed')
		expect(await s.progress()).toBe(100)
	})

	it('только тест: открытие и неудачная попытка урок не завершают; сдача с зачётом — завершает; неудача потом зачёт не снимает', async () => {
		const s = await setup({ quiz: true })
		expect(await s.student.learn.lessons.open({ lessonId: s.lesson.id })).toMatchObject({ status: 'in_progress' })
		expect(await s.status()).toBe('in_progress')
		expect((await s.takeQuiz('wrong')).attempt.passed).toBe(false)
		expect(await s.status()).toBe('in_progress')
		expect((await s.takeQuiz('right')).attempt.passed).toBe(true)
		expect(await s.status()).toBe('completed')
		expect(await s.progress()).toBe(100)
		// ещё одна неудачная попытка выполненное не отменяет
		await s.takeQuiz('wrong')
		expect(await s.status()).toBe('completed')
	})

	it('тест и задание: нужны оба — тест сдан, работа на проверке: не завершён; принята: завершён, курс пройден', async () => {
		const s = await setup({ quiz: true, assignment: true })
		await s.student.learn.lessons.open({ lessonId: s.lesson.id })
		await s.takeQuiz('right')
		expect(await s.status()).toBe('in_progress') // задание ещё не принято
		const id = await s.submitWork()
		expect(await s.status()).toBe('in_progress') // на проверке
		await s.t.as('curator').assignment.review({ submissionId: id, decision: 'accept', comment: null })
		expect(await s.status()).toBe('completed')
		expect(await s.progress()).toBe(100)
	})

	it('задание: «на доработку» не завершает; после пересдачи и принятия — завершает', async () => {
		const s = await setup({ assignment: true })
		await s.student.learn.lessons.open({ lessonId: s.lesson.id })
		const id = await s.submitWork()
		await s.t
			.as('teacher')
			.assignment.review({ submissionId: id, decision: 'needs_revision', comment: doc('Доработайте') })
		expect(await s.status()).toBe('in_progress')
		await s.student.assignment.submit({ ...s.asgRef, body: doc('Исправил'), fileIds: [] })
		await s.t.as('teacher').assignment.review({ submissionId: id, decision: 'accept', comment: null })
		expect(await s.status()).toBe('completed')
	})

	it('отклонённая работа урок не завершает (и не может быть пересдана)', async () => {
		const s = await setup({ assignment: true })
		await s.student.learn.lessons.open({ lessonId: s.lesson.id })
		const id = await s.submitWork()
		await s.t.as('teacher').assignment.review({ submissionId: id, decision: 'reject', comment: doc('Не по теме') })
		expect(await s.status()).toBe('in_progress')
		expect(await fails(s.student.assignment.submit({ ...s.asgRef, body: doc('Ещё раз'), fileIds: [] }))).toMatchObject({
			code: 'SUBMISSION_STATE',
		})
	})

	it('задание без проверки: при отправке принимается и сразу завершает урок', async () => {
		const s = await setup({ assignment: true, assignmentSettings: { requiresReview: false } })
		await s.student.learn.lessons.open({ lessonId: s.lesson.id })
		expect(await s.status()).toBe('in_progress')
		await s.submitWork()
		expect(await s.status()).toBe('completed')
	})
})

describe('правила view и manual; настройка урока', () => {
	it('view завершает при открытии независимо от тестов; manual — только кнопкой; переключение действует сразу', async () => {
		const s = await setup({ quiz: true })
		await s.c.courses.lessons.update({ id: s.lesson.id, completionRule: 'view' })
		await s.student.learn.lessons.open({ lessonId: s.lesson.id })
		expect(await s.status()).toBe('completed')

		const m = await setup({ quiz: true })
		expect((await m.c.courses.lessons.update({ id: m.lesson.id, completionRule: 'manual' })).completionRule).toBe(
			'manual',
		)
		await m.student.learn.lessons.open({ lessonId: m.lesson.id })
		expect(await m.status()).toBe('in_progress')
		await m.takeQuiz('right') // тест сдан, но правило «по кнопке» — урок не завершается сам
		expect(await m.status()).toBe('in_progress')
		await m.student.learn.lessons.complete({ lessonId: m.lesson.id })
		expect(await m.status()).toBe('completed')

		// вернули «по заданиям и тестам» у незавершённого урока — завершится при выполнении
		const r = await setup({ quiz: true })
		await r.c.courses.lessons.update({ id: r.lesson.id, completionRule: 'manual' })
		await r.c.courses.lessons.update({ id: r.lesson.id, completionRule: 'all_blocks' })
		await r.student.learn.lessons.open({ lessonId: r.lesson.id })
		await r.takeQuiz('right')
		expect(await r.status()).toBe('completed')
	})

	it('права на настройку: куратор и ученик — NO_PERMISSION; чужой урок и неизвестное значение', async () => {
		const s = await setup({})
		expect(
			await fails(s.t.as('curator').courses.lessons.update({ id: s.lesson.id, completionRule: 'view' })),
		).toMatchObject({ code: 'NO_PERMISSION' })
		expect(await fails(s.student.courses.lessons.update({ id: s.lesson.id, completionRule: 'view' }))).toMatchObject({
			code: 'NO_PERMISSION',
		})
		const other = await withTestSchool()
		expect(
			await fails(other.as('teacher').courses.lessons.update({ id: s.lesson.id, completionRule: 'view' })),
		).toMatchObject({ code: 'LESSON_NOT_FOUND' })
		await expect(
			s.c.courses.lessons.update({ id: s.lesson.id, completionRule: 'nope' as 'view' }),
		).rejects.toMatchObject({ status: 400 })
	})
})
