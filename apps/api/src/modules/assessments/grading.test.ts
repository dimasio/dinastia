// Ручная проверка `open_text` (карточка 3.6): тесты в очереди, попытка для проверяющего, оценки (границы, частями), итог и
// «сдал / не сдал», завершение урока, что видит ученик, права и область; письмо «тест проверен» (4.8).
import { questionTypes } from '@dinastia/questions'
import { ORPCError } from '@orpc/client'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pool } from '#/kernel/db/client.ts'
import { withTenant } from '#/kernel/db/tenant.ts'
import { log } from '#/kernel/log.ts'
import { memoryOutbox } from '#/kernel/mail/transport.ts'
import { members } from '#/kernel/members/schema.ts'
import { tenantCtx } from '#/kernel/tenant-ctx.ts'
import { drainJobs, lastMailTo, startTestWorker, stopTestWorker } from '#/test/jobs.ts'
import { cleanupTestSchools, withTestSchool } from '#/test/school.ts'
import { enrollMember } from '../learning/service.ts'
import { intoCuratorGroup } from '../learning/testing.ts'

beforeAll(startTestWorker)
afterAll(async () => {
	await stopTestWorker()
	await cleanupTestSchools()
	await pool.end()
})

const failure = (e: unknown) => (e instanceof ORPCError ? (e.data as { code?: string }) : e)
const fails = (p: Promise<unknown>) => p.then(() => 'ok', failure)
const doc = (text: string) => ({
	type: 'doc' as const,
	content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})

/** Тест: число (2 балла, автопроверка) и `open` вопросов `open_text` (по 5 баллов, вручную). */
async function setup(opts: { open?: number; showCorrect?: string; passScorePct?: number } = {}) {
	const t = await withTestSchool()
	const c = t.as('teacher')
	const course = await c.courses.create({ title: 'Курс с ручной проверкой' })
	const section = await c.courses.sections.create({ courseId: course.id, title: 'Раздел' })
	const lesson = await c.courses.lessons.create({ sectionId: section.id, title: 'Урок' })
	const mk = (type: 'number' | 'open_text', prompt: string) =>
		c.assessments.questions.create({
			courseId: course.id,
			type,
			data: { ...(questionTypes[type].example() as Record<string, unknown>), prompt: doc(prompt) },
			tags: [],
		})
	const number = await mk('number', 'Чему равно π?')
	const opens = []
	for (let i = 0; i < (opts.open ?? 1); i++) opens.push(await mk('open_text', `Опишите работу ${i + 1}`))
	const block = await c.courses.blocks.create({ lessonId: lesson.id, type: 'quiz' })
	await c.courses.blocks.update({
		id: block.id,
		data: {
			...block.data,
			questions: [number, ...opens].map((q) => ({ questionId: q.id })),
			showCorrect: opts.showCorrect ?? 'after_submit',
			passScorePct: opts.passScorePct ?? 60,
		},
	})
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
	const blockKey = (await c.courses.blocks.list({ lessonId: lesson.id })).find((b) => b.id === block.id)
		?.blockKey as string
	const student = t.as('student')
	const ref = { lessonId: lesson.id, blockKey }
	const lessonStatus = async () =>
		(await student.learn.courses.get({ courseId: course.id })).sections[0]?.lessons[0]?.status
	/** Пройти тест: число верно, развёрнутые — текстом; вернёт результат сдачи. */
	const take = async () => {
		const view = await student.quiz.start(ref)
		for (const q of view.questions)
			await student.quiz.answer({
				attemptId: view.attempt.id,
				attemptQuestionId: q.id,
				response: q.type === 'number' ? { value: 3.14 } : { text: 'Это был пейзаж с рекой' },
			})
		return { view, result: await student.quiz.submit({ attemptId: view.attempt.id }) }
	}
	return { t, c, course, lesson, student, ref, take, lessonStatus, curator: t.as('curator') }
}

describe('очередь с тестами', () => {
	it('попытка с ручным вопросом — строка очереди «тест»; без ручных вопросов — нет; фильтры вид и статус', async () => {
		const s = await setup()
		const { view } = await s.take()
		const q = await s.curator.review.list({})
		expect(q.items).toMatchObject([
			{
				id: view.attempt.id,
				kind: 'quiz',
				status: 'submitted',
				revision: 1,
				courseTitle: 'Курс с ручной проверкой',
				lessonTitle: 'Урок',
			},
		])
		expect((await s.curator.review.list({ filters: { kind: 'assignment' } })).total).toBe(0)
		expect((await s.curator.review.list({ filters: { kind: 'quiz', status: 'submitted' } })).total).toBe(1)
		expect((await s.curator.review.list({ filters: { status: 'graded' } })).total).toBe(0)

		// тест без ручных вопросов в очередь не попадает
		const auto = await setup({ open: 0 })
		await auto.take()
		expect((await auto.curator.review.list({})).total).toBe(0)
	})

	it('сдача и тест в одной очереди: «на проверке» сверху; после оценки — «оценён»', async () => {
		const s = await setup()
		const { view } = await s.take()
		await s.curator.review.gradeAttempt({
			attemptId: view.attempt.id,
			grades: [{ attemptQuestionId: view.questions[1]?.id as string, score: 5, feedback: null }],
		})
		const rows = await s.curator.review.list({})
		expect(rows.items[0]).toMatchObject({ kind: 'quiz', status: 'graded' })
		expect((await s.curator.review.list({ filters: { status: 'graded' } })).total).toBe(1)
		expect((await s.curator.review.list({ filters: { status: 'submitted' } })).total).toBe(0)
	})
})

describe('оценка попытки', () => {
	it('review.attempt: ответ ученика, ручной вопрос помечен, баллы автопроверки', async () => {
		const s = await setup()
		const { view } = await s.take()
		const a = await s.curator.review.attempt({ attemptId: view.attempt.id })
		expect(a).toMatchObject({
			autoScore: 2,
			manualMax: 5,
			passScorePct: 60,
			student: { email: s.t.people.student.email },
			attempt: { status: 'submitted', score: 2, maxScore: 7 },
		})
		const open = a.questions.find((q) => q.manual)
		expect(open).toMatchObject({
			type: 'open_text',
			points: 5,
			score: null,
			response: { text: 'Это был пейзаж с рекой' },
		})
		expect(a.questions.find((q) => q.type === 'number')).toMatchObject({ manual: false, score: 2, isCorrect: true })
		expect(JSON.stringify(a)).not.toMatch(/Образец|numberAnswer/) // образец ответа проверяющему не нужен в данных ученика
	})

	it('оценка: итог, сдал, статус graded, урок завершён; ученик видит баллы и комментарий даже при «никогда»', async () => {
		const s = await setup({ showCorrect: 'never' })
		await s.student.learn.lessons.open({ lessonId: s.lesson.id })
		expect(await s.lessonStatus()).toBe('in_progress') // тест ещё не оценён
		const { view, result } = await s.take()
		expect(result.attempt).toMatchObject({ status: 'submitted', passed: null })
		expect(result.manual).toMatchObject([{ type: 'open_text', score: null, feedback: null }])
		expect(await s.lessonStatus()).toBe('in_progress')

		const done = await s.curator.review.gradeAttempt({
			attemptId: view.attempt.id,
			grades: [
				{
					attemptQuestionId: view.questions[1]?.id as string,
					score: 4,
					feedback: doc('Хороший рассказ, не хватает деталей'),
				},
			],
		})
		expect(done.attempt).toMatchObject({ status: 'graded', score: 6, passed: true }) // 2 + 4 из 7 = 86 %
		expect(await s.lessonStatus()).toBe('completed')

		const mine = await s.student.quiz.result({ attemptId: view.attempt.id })
		expect(mine).toMatchObject({ revealed: false, questions: [], pct: 86, attempt: { passed: true } })
		expect(mine.manual).toMatchObject([{ score: 4 }])
		expect(JSON.stringify(mine.manual[0]?.feedback)).toContain('не хватает деталей')

		// письмо ученику после ручной проверки (4.8)
		const mail = await lastMailTo(s.t.people.student.email)
		expect(mail.subject).toContain('тест «Урок» проверен')
		expect(mail.text).toContain('Тест сдан: 6 из 7 баллов')
	})

	it('автопроверка без ручных вопросов — письма «тест проверен» нет', async () => {
		const s = await setup({ open: 0 })
		await s.student.learn.lessons.open({ lessonId: s.lesson.id })
		const { result } = await s.take()
		expect(result.attempt).toMatchObject({ status: 'graded' })
		await drainJobs()
		expect(memoryOutbox.filter((m) => m.to === s.t.people.student.email && m.subject.includes('проверен'))).toEqual([])
	})

	it('низкая оценка — не сдал, урок не завершён; повторная оценка запрещена; граница порога', async () => {
		const s = await setup({ passScorePct: 90 })
		await s.student.learn.lessons.open({ lessonId: s.lesson.id })
		const { view } = await s.take()
		const q = view.questions[1]?.id as string
		const done = await s.curator.review.gradeAttempt({
			attemptId: view.attempt.id,
			grades: [{ attemptQuestionId: q, score: 3, feedback: null }],
		})
		expect(done.attempt).toMatchObject({ status: 'graded', score: 5, passed: false }) // 5 из 7 = 71 % < 90 %
		expect(await s.lessonStatus()).toBe('in_progress')
		expect(
			await fails(
				s.curator.review.gradeAttempt({
					attemptId: view.attempt.id,
					grades: [{ attemptQuestionId: q, score: 5, feedback: null }],
				}),
			),
		).toMatchObject({ code: 'ATTEMPT_STATE' })
	})

	it('границы баллов: не больше максимума, шаг 0,5, не для автоматических вопросов, не чужой вопрос', async () => {
		const s = await setup()
		const { view } = await s.take()
		const open = view.questions[1]?.id as string
		const auto = view.questions[0]?.id as string
		const grade = (attemptQuestionId: string, score: number) =>
			fails(
				s.curator.review.gradeAttempt({
					attemptId: view.attempt.id,
					grades: [{ attemptQuestionId, score, feedback: null }],
				}),
			)
		expect(await grade(open, 5.5)).toMatchObject({ code: 'SCORE_INVALID' })
		expect(await grade(open, 2.3)).toMatchObject({ code: 'SCORE_INVALID' })
		expect(await grade(auto, 1)).toMatchObject({ code: 'QUESTION_NOT_MANUAL' })
		expect(await grade(crypto.randomUUID(), 1)).toMatchObject({ code: 'ATTEMPT_QUESTION_NOT_FOUND' })
		await expect(
			s.curator.review.gradeAttempt({
				attemptId: view.attempt.id,
				grades: [{ attemptQuestionId: open, score: -1, feedback: null }],
			}),
		).rejects.toMatchObject({ status: 400 })
		// шаг 0,5 допустим
		expect(
			(
				await s.curator.review.gradeAttempt({
					attemptId: view.attempt.id,
					grades: [{ attemptQuestionId: open, score: 2.5, feedback: null }],
				})
			).attempt.score,
		).toBe(4.5)
	})

	it('несколько ручных вопросов: оценки частями; пока не оценены все — «ждёт проверки», итог растёт; после последней — graded', async () => {
		const s = await setup({ open: 2 })
		const { view } = await s.take()
		const [first, second] = [view.questions[1]?.id as string, view.questions[2]?.id as string]
		const part = await s.curator.review.gradeAttempt({
			attemptId: view.attempt.id,
			grades: [{ attemptQuestionId: first, score: 5, feedback: null }],
		})
		expect(part.attempt).toMatchObject({ status: 'submitted', score: 7, passed: null }) // 2 + 5
		expect((await s.curator.review.list({ filters: { status: 'submitted' } })).total).toBe(1)
		const full = await s.curator.review.gradeAttempt({
			attemptId: view.attempt.id,
			grades: [{ attemptQuestionId: second, score: 0, feedback: doc('Не по теме') }],
		})
		expect(full.attempt).toMatchObject({ status: 'graded', score: 7, maxScore: 12, passed: false }) // 58 % < 60 %
	})

	it('неотвеченный ручной вопрос оценивается как пустой ответ', async () => {
		const s = await setup()
		const view = await s.student.quiz.start(s.ref) // ничего не отвечал
		await s.student.quiz.submit({ attemptId: view.attempt.id })
		const done = await s.curator.review.gradeAttempt({
			attemptId: view.attempt.id,
			grades: [{ attemptQuestionId: view.questions[1]?.id as string, score: 0, feedback: null }],
		})
		expect(done.attempt).toMatchObject({ status: 'graded', score: 0, passed: false })
	})
})

describe('права и область', () => {
	it('проверяют curator, teacher, admin; ученик — нет; чужая школа и попытка без ручных вопросов — не найдены', async () => {
		const s = await setup()
		const { view } = await s.take()
		for (const role of ['curator', 'teacher', 'admin'] as const)
			expect((await s.t.as(role).review.attempt({ attemptId: view.attempt.id })).attempt.id).toBe(view.attempt.id)
		expect(await fails(s.student.review.attempt({ attemptId: view.attempt.id }))).toMatchObject({
			code: 'NO_PERMISSION',
		})
		expect(
			await fails(
				s.student.review.gradeAttempt({
					attemptId: view.attempt.id,
					grades: [{ attemptQuestionId: view.questions[1]?.id as string, score: 1, feedback: null }],
				}),
			),
		).toMatchObject({ code: 'NO_PERMISSION' })
		const other = await withTestSchool()
		expect(await fails(other.as('curator').review.attempt({ attemptId: view.attempt.id }))).toMatchObject({
			code: 'ATTEMPT_NOT_FOUND',
		})

		const auto = await setup({ open: 0 })
		const a = await auto.take()
		expect(await fails(auto.curator.review.attempt({ attemptId: a.view.attempt.id }))).toMatchObject({
			code: 'ATTEMPT_NOT_FOUND',
		})
		// идущая попытка проверке не подлежит
		const active = await setup()
		const running = await active.student.quiz.start(active.ref)
		expect(await fails(active.curator.review.attempt({ attemptId: running.attempt.id }))).toMatchObject({
			code: 'ATTEMPT_NOT_FOUND',
		})
	})
})
