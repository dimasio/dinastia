// biome-ignore-all lint/suspicious/noExplicitAny: тест разбирает данные вопросов разных типов
// Прохождение теста (карточка 3.3, часть б): старт со снимком, лимит и гонка стартов, ответы всех типов, сдача и баллы,
// проходной балл, показ ответов по трём правилам, `open_text`, таймер и автосдача, ревизии вопросов, случайный выбор,
// секреты, права и изоляция.
import { questionTypes } from '@dinastia/questions'
import { ORPCError } from '@orpc/client'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { pool } from '#/kernel/db/client.ts'
import { withTenant } from '#/kernel/db/tenant.ts'
import { log } from '#/kernel/log.ts'
import { members } from '#/kernel/members/schema.ts'
import { tenantCtx } from '#/kernel/tenant-ctx.ts'
import { cleanupTestSchools, type TestSchool, withTestSchool } from '#/test/school.ts'
import { lessons } from '../courses/schema.ts'
import { enrollMember } from '../learning/service.ts'
import { expireAttemptsJob } from './jobs.ts'
import { quizAttempts } from './schema.ts'

afterAll(async () => {
	await cleanupTestSchools()
	await pool.end()
})

type TypeName = keyof typeof questionTypes
const failure = (e: unknown) => (e instanceof ORPCError ? (e.data as { code?: string; [k: string]: unknown }) : e)
const fails = (p: Promise<unknown>) => p.then(() => 'ok', failure)
const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })

interface Opts {
	types: TypeName[]
	quiz?: Record<string, unknown>
	/** Не публиковать курс и не зачислять ученика. */
	skipEnroll?: boolean
}

/** Курс с одним уроком, тестом из вопросов указанных типов (по одному), ученик зачислен. */
async function setup(opts: Opts) {
	const t = await withTestSchool()
	const c = t.as('teacher')
	const course = await c.courses.create({ title: 'Курс с тестом' })
	const section = await c.courses.sections.create({ courseId: course.id, title: 'Раздел' })
	const lesson = await c.courses.lessons.create({ sectionId: section.id, title: 'Урок' })
	const bank: Record<string, Awaited<ReturnType<typeof c.assessments.questions.get>>> = {}
	const ids: string[] = []
	for (const type of opts.types) {
		const created = await c.assessments.questions.create({
			courseId: course.id,
			type,
			data: questionTypes[type].example() as Record<string, unknown>,
			tags: [type],
		})
		bank[type] = await c.assessments.questions.get({ id: created.id })
		ids.push(created.id)
	}
	const block = await c.courses.blocks.create({ lessonId: lesson.id, type: 'quiz' })
	await c.courses.blocks.update({
		id: block.id,
		data: { ...block.data, questions: ids.map((questionId) => ({ questionId })), ...opts.quiz },
	})
	await c.courses.lessons.publish({ id: lesson.id })
	await c.courses.publish({ id: course.id })
	let enrollmentId = ''
	if (!opts.skipEnroll) enrollmentId = (await enroll(t, course.id, 'student')).id
	// block_key опубликованного блока — из публичных данных плеера не виден, берём из черновика (общий у версий)
	const blockKey = (await c.courses.blocks.list({ lessonId: lesson.id })).find((b) => b.id === block.id)
		?.blockKey as string
	return { t, c, course, lesson, bank, ids, blockKey, enrollmentId, student: t.as('student') }
}

async function enroll(t: TestSchool, courseId: string, role: 'student' | 'curator') {
	return withTenant(t.school.id, async (tx) => {
		const [m] = await tx.select().from(members).where(eq(members.userId, t.people[role].id))
		const ctx = tenantCtx(tx, t.school, { now: () => new Date(), log })
		return enrollMember(ctx, { memberId: (m as { id: string }).id, courseId })
	})
}

type Student = ReturnType<TestSchool['as']>
const ref = (s: { lesson: { id: string }; blockKey: string }) => ({ lessonId: s.lesson.id, blockKey: s.blockKey })

/** Ответить на вопрос попытки по его типу «верно» или «неверно» — по данным банка. */
async function answerAll(
	student: Student,
	view: Awaited<ReturnType<Student['quiz']['start']>>,
	bank: Awaited<ReturnType<ReturnType<TestSchool['as']>['assessments']['questions']['get']>>[],
	mode: 'right' | 'wrong',
) {
	for (const q of view.questions) {
		const stored = bank.find((b) => b.type === q.type)?.data as Record<string, any>
		let response: unknown
		switch (q.type) {
			case 'single_choice': {
				const right = stored.options.find((o: any) => o.isCorrect).id
				const wrong = stored.options.find((o: any) => !o.isCorrect).id
				response = { selected: mode === 'right' ? right : wrong }
				break
			}
			case 'multiple_choice': {
				const right = stored.options.filter((o: any) => o.isCorrect).map((o: any) => o.id)
				const wrong = stored.options.filter((o: any) => !o.isCorrect).map((o: any) => o.id)
				response = { selected: mode === 'right' ? right : wrong }
				break
			}
			case 'text_input':
				response = { text: mode === 'right' ? '  париж ' : 'Лондон' }
				break
			case 'number':
				response = { value: mode === 'right' ? 3.14 : 9 }
				break
			case 'ordering': {
				const correct = [...stored.steps]
					.sort((a: any, b: any) => a.correctPosition - b.correctPosition)
					.map((s: any) => s.id)
				response = { order: mode === 'right' ? correct : [...correct.slice(1), correct[0]] }
				break
			}
			case 'matching': {
				const rightOf = (key: string) => stored.right.find((r: any) => r.matchKey === key).id
				const pairs = stored.left.map((l: any) => ({ left: l.id, right: rightOf(l.matchKey) }))
				response = {
					pairs:
						mode === 'right'
							? pairs
							: pairs.map((p: any, i: number) => ({ left: p.left, right: pairs[(i + 1) % pairs.length].right })),
				}
				break
			}
			default:
				response = { text: 'Развёрнутый ответ' }
		}
		await student.quiz.answer({ attemptId: view.attempt.id, attemptQuestionId: q.id, response })
	}
}

const ALL: TypeName[] = ['single_choice', 'multiple_choice', 'text_input', 'number', 'ordering', 'matching']
// баллы примеров: 2 + 4 + 1 + 2 + 3 + 2 = 14; open_text — ещё 5

describe('старт и снимок', () => {
	it('состояние до старта; старт создаёт попытку; повторный старт возвращает ту же', async () => {
		const s = await setup({ types: ['single_choice', 'number'], quiz: { timeLimitSec: 600, attemptsLimit: 2 } })
		const state = await s.student.quiz.get(ref(s))
		expect(state).toMatchObject({ attempts: [], activeAttemptId: null, canStart: true, best: null })
		expect(state.settings).toMatchObject({ questionsCount: 2, attemptsLimit: 2, timeLimitSec: 600, passScorePct: 60 })

		const view = await s.student.quiz.start(ref(s))
		expect(view.attempt).toMatchObject({ status: 'in_progress', maxScore: 4, score: 0, passed: null })
		expect(view.attempt.deadlineAt).not.toBeNull()
		expect(view.questions.map((q) => q.type)).toEqual(['single_choice', 'number'])
		expect(view.answered).toBe(0)
		const again = await s.student.quiz.start(ref(s))
		expect(again.attempt.id).toBe(view.attempt.id)
		expect((await s.student.quiz.get(ref(s))).activeAttemptId).toBe(view.attempt.id)
	})

	it('ученику не уходят верные ответы и пояснения — ни в старте, ни при возобновлении', async () => {
		const s = await setup({ types: ALL })
		const view = await s.student.quiz.start(ref(s))
		const json = JSON.stringify(view)
		expect(json).not.toMatch(
			/isCorrect|accepted|correctPosition|matchKey|numberAnswer|explanation|делятся только|Париж — столица|Сначала эскиз|Франция — Париж|Два плюс два/,
		)
		const resumed = await s.student.quiz.attempt({ attemptId: view.attempt.id })
		expect(JSON.stringify(resumed)).not.toMatch(/isCorrect|accepted|correctPosition|matchKey|numberAnswer|explanation/)
	})

	it('лимит попыток: после лимита — ATTEMPTS_EXHAUSTED; нет лимита — без ограничения', async () => {
		const s = await setup({ types: ['single_choice'], quiz: { attemptsLimit: 2 } })
		for (let i = 0; i < 2; i++) {
			const v = await s.student.quiz.start(ref(s))
			await s.student.quiz.submit({ attemptId: v.attempt.id })
		}
		expect(await fails(s.student.quiz.start(ref(s)))).toMatchObject({ code: 'ATTEMPTS_EXHAUSTED' })
		const state = await s.student.quiz.get(ref(s))
		expect(state).toMatchObject({ canStart: false, activeAttemptId: null })
		expect(state.attempts).toHaveLength(2)

		const free = await setup({ types: ['single_choice'] })
		for (let i = 0; i < 4; i++) {
			const v = await free.student.quiz.start(ref(free))
			await free.student.quiz.submit({ attemptId: v.attempt.id })
		}
		expect((await free.student.quiz.get(ref(free))).canStart).toBe(true)
	})

	it('гонка: два одновременных старта дают одну попытку', async () => {
		const s = await setup({ types: ['single_choice'], quiz: { attemptsLimit: 1 } })
		const [a, b] = await Promise.all([s.student.quiz.start(ref(s)), s.student.quiz.start(ref(s))])
		expect(a.attempt.id).toBe(b.attempt.id)
		expect((await s.student.quiz.get(ref(s))).attempts).toHaveLength(1)
	})

	it('перемешивание: «порядок» и «соответствие» — всегда, элементы сохраняются; вопросы по настройке', async () => {
		const s = await setup({
			types: ['ordering', 'matching', 'single_choice'],
			quiz: { shuffleQuestions: true, shuffleOptions: true },
		})
		const view = await s.student.quiz.start(ref(s))
		expect([...view.questions.map((q) => q.type)].sort()).toEqual(['matching', 'ordering', 'single_choice'])
		const ordering = view.questions.find((q) => q.type === 'ordering')?.data as { steps: { id: string }[] }
		expect(ordering.steps.map((x) => x.id).sort()).toEqual(
			((s.bank.ordering?.data.steps ?? []) as { id: string }[]).map((x) => x.id).sort(),
		)
	})
})

describe('ответы', () => {
	it('сохраняются сразу и читаются при возобновлении; null снимает ответ; чужой элемент — ANSWER_INVALID', async () => {
		const s = await setup({ types: ALL })
		const view = await s.student.quiz.start(ref(s))
		await answerAll(s.student, view, Object.values(s.bank), 'right')
		const resumed = await s.student.quiz.attempt({ attemptId: view.attempt.id })
		expect(resumed.answered).toBe(6)
		const single = resumed.questions.find((q) => q.type === 'single_choice')
		const stored = s.bank.single_choice?.data.options as { id: string; isCorrect: boolean }[]
		expect(single?.response).toEqual({ selected: stored.find((o) => o.isCorrect)?.id })
		expect(resumed.questions.find((q) => q.type === 'text_input')?.response).toEqual({ text: '  париж ' })
		expect(resumed.questions.find((q) => q.type === 'number')?.response).toEqual({ value: 3.14 })

		const q = resumed.questions.find((x) => x.type === 'single_choice')
		expect(
			await fails(
				s.student.quiz.answer({
					attemptId: view.attempt.id,
					attemptQuestionId: q?.id as string,
					response: { selected: crypto.randomUUID() },
				}),
			),
		).toMatchObject({ code: 'ANSWER_INVALID' })
		await s.student.quiz.answer({ attemptId: view.attempt.id, attemptQuestionId: q?.id as string, response: null })
		expect((await s.student.quiz.attempt({ attemptId: view.attempt.id })).answered).toBe(5)
		// неверная форма ответа — ошибка схемы типа
		await expect(
			s.student.quiz.answer({
				attemptId: view.attempt.id,
				attemptQuestionId: q?.id as string,
				response: { selected: 5 },
			}),
		).rejects.toMatchObject({ status: 400 })
	})
})

describe('сдача и проверка', () => {
	it('все верно: 14 из 14, сдал, graded; все неверно: 0, не сдал', async () => {
		const s = await setup({ types: ALL })
		const bank = Object.values(s.bank)
		const good = await s.student.quiz.start(ref(s))
		await answerAll(s.student, good, bank, 'right')
		const r = await s.student.quiz.submit({ attemptId: good.attempt.id })
		expect(r.attempt).toMatchObject({ status: 'graded', score: 14, maxScore: 14, passed: true })
		expect(r.pct).toBe(100)

		const bad = await s.student.quiz.start(ref(s))
		await answerAll(s.student, bad, bank, 'wrong')
		const w = await s.student.quiz.submit({ attemptId: bad.attempt.id })
		expect(w.attempt).toMatchObject({ status: 'graded', score: 0, passed: false })
		const state = await s.student.quiz.get(ref(s))
		expect(state.best).toEqual({ score: 14, maxScore: 14 })
	})

	it('частичные баллы и проходной балл; неотвеченные — 0', async () => {
		const s = await setup({ types: ['multiple_choice', 'single_choice'], quiz: { passScorePct: 50 } })
		const view = await s.student.quiz.start(ref(s))
		const stored = s.bank.multiple_choice?.data.options as { id: string; isCorrect: boolean }[]
		const oneRight = stored.find((o) => o.isCorrect)?.id as string
		const q = view.questions.find((x) => x.type === 'multiple_choice')
		await s.student.quiz.answer({
			attemptId: view.attempt.id,
			attemptQuestionId: q?.id as string,
			response: { selected: [oneRight] },
		})
		const r = await s.student.quiz.submit({ attemptId: view.attempt.id })
		// из 4 баллов multiple_choice половина = 2; single_choice не отвечен; всего 2 из 6 = 33% < 50%
		expect(r.attempt).toMatchObject({ score: 2, maxScore: 6, passed: false })
		expect(r.pct).toBe(33)
	})

	it('повторная сдача и ответ после сдачи: результат тот же / ATTEMPT_NOT_ACTIVE', async () => {
		const s = await setup({ types: ['number'] })
		const view = await s.student.quiz.start(ref(s))
		const first = await s.student.quiz.submit({ attemptId: view.attempt.id })
		const second = await s.student.quiz.submit({ attemptId: view.attempt.id })
		expect(second.attempt).toEqual(first.attempt)
		expect(
			await fails(
				s.student.quiz.answer({
					attemptId: view.attempt.id,
					attemptQuestionId: view.questions[0]?.id as string,
					response: { value: 3 },
				}),
			),
		).toMatchObject({ code: 'ATTEMPT_NOT_ACTIVE' })
	})

	it('open_text: попытка «отправлена», баллы автопроверяемых видны, passed пусто', async () => {
		const s = await setup({ types: ['number', 'open_text'] })
		const view = await s.student.quiz.start(ref(s))
		await answerAll(s.student, view, Object.values(s.bank), 'right')
		const r = await s.student.quiz.submit({ attemptId: view.attempt.id })
		expect(r.attempt).toMatchObject({ status: 'submitted', score: 2, maxScore: 7, passed: null })
		const open = r.questions.find((q) => q.type === 'open_text')
		expect(open).toMatchObject({ score: null, isCorrect: null })
		expect(r.questions.find((q) => q.type === 'number')).toMatchObject({ score: 2, isCorrect: true })
	})
})

describe('показ верных ответов', () => {
	const run = async (showCorrect: string, mode: 'right' | 'wrong') => {
		const s = await setup({ types: ['single_choice', 'text_input'], quiz: { showCorrect } })
		const view = await s.student.quiz.start(ref(s))
		await answerAll(s.student, view, Object.values(s.bank), mode)
		return s.student.quiz.submit({ attemptId: view.attempt.id })
	}
	it('никогда — только итог; в разборе по запросу тоже пусто', async () => {
		const r = await run('never', 'right')
		expect(r).toMatchObject({ revealed: false, questions: [] })
		expect(r.attempt.passed).toBe(true)
	})
	it('после сдачи — ответы, верно/неверно, верный ответ и пояснение', async () => {
		const r = await run('after_submit', 'wrong')
		expect(r.revealed).toBe(true)
		expect(r.questions).toHaveLength(2)
		expect(r.questions.every((q) => q.isCorrect === false)).toBe(true)
		expect(JSON.stringify(r.questions.map((q) => q.review))).toContain('Париж') // допустимые ответы text_input
	})
	it('после успешной сдачи — только сдавшему', async () => {
		expect((await run('after_pass', 'wrong')).revealed).toBe(false)
		expect((await run('after_pass', 'right')).revealed).toBe(true)
	})
})

describe('таймер', () => {
	it('ответ после срока — ATTEMPT_EXPIRED; при обращении попытка сдаётся сама; задача сдаёт просроченные', async () => {
		const s = await setup({ types: ['number'], quiz: { timeLimitSec: 600 } })
		const view = await s.student.quiz.start(ref(s))
		const qid = view.questions[0]?.id as string
		await s.student.quiz.answer({ attemptId: view.attempt.id, attemptQuestionId: qid, response: { value: 3.14 } })
		const past = async (id: string) =>
			withTenant(s.t.school.id, (tx) =>
				tx
					.update(quizAttempts)
					.set({ deadlineAt: new Date(Date.now() - 1000) })
					.where(eq(quizAttempts.id, id)),
			)
		await past(view.attempt.id)
		expect(
			await fails(
				s.student.quiz.answer({ attemptId: view.attempt.id, attemptQuestionId: qid, response: { value: 9 } }),
			),
		).toMatchObject({ code: 'ATTEMPT_EXPIRED' })
		// состояние теста сдаёт просроченную попытку: оценивается сохранённое (3,14 — верно)
		const state = await s.student.quiz.get(ref(s))
		expect(state.attempts[0]).toMatchObject({ status: 'graded', score: 2, passed: true })
		expect(state.activeAttemptId).toBeNull()

		// вторая попытка просрочена, но к ней никто не обращался — сдаёт задача
		const second = await s.student.quiz.start(ref(s))
		await past(second.attempt.id)
		await withTenant(s.t.school.id, async (tx) => {
			await expireAttemptsJob.handler(tenantCtx(tx, s.t.school, { now: () => new Date(), log }), {})
		})
		const rows = await withTenant(s.t.school.id, (tx) =>
			tx.select().from(quizAttempts).where(eq(quizAttempts.id, second.attempt.id)),
		)
		expect(rows[0]).toMatchObject({ status: 'graded', score: 0, passed: false })
	})

	it('сдача после срока допустима: оценивается сохранённое', async () => {
		const s = await setup({ types: ['number'], quiz: { timeLimitSec: 600 } })
		const view = await s.student.quiz.start(ref(s))
		await s.student.quiz.answer({
			attemptId: view.attempt.id,
			attemptQuestionId: view.questions[0]?.id as string,
			response: { value: 3.14 },
		})
		await withTenant(s.t.school.id, (tx) => tx.update(quizAttempts).set({ deadlineAt: new Date(Date.now() - 1000) }))
		const r = await s.student.quiz.submit({ attemptId: view.attempt.id })
		expect(r.attempt).toMatchObject({ status: 'graded', score: 2 })
	})
})

describe('ревизии и снимок', () => {
	it('правка вопроса после попытки — новая ревизия; прежняя попытка не меняется, новая берёт текущую', async () => {
		const s = await setup({ types: ['text_input'] })
		const view = await s.student.quiz.start(ref(s))
		expect(JSON.stringify(view.questions[0]?.data)).toContain('Столица Франции?')
		const id = s.ids[0] as string
		const stored = s.bank.text_input?.data as Record<string, unknown>
		const edited = await s.c.assessments.questions.update({
			id,
			data: { ...stored, prompt: doc('Столица Италии?'), accepted: [{ text: 'Рим' }] },
			tags: ['text_input'],
		})
		expect(edited.id).not.toBe(id) // новая ревизия
		expect(edited.tags).toEqual(['text_input'])
		// прежняя попытка — по старой формулировке и со старыми ответами
		const resumed = await s.student.quiz.attempt({ attemptId: view.attempt.id })
		expect(JSON.stringify(resumed.questions[0]?.data)).toContain('Столица Франции?')
		await s.student.quiz.answer({
			attemptId: view.attempt.id,
			attemptQuestionId: view.questions[0]?.id as string,
			response: { text: 'Париж' },
		})
		const r = await s.student.quiz.submit({ attemptId: view.attempt.id })
		expect(r.attempt.score).toBe(1)
		// новая попытка — по текущей ревизии (тест хранит id прежней, старт идёт за цепочкой)
		const next = await s.student.quiz.start(ref(s))
		expect(JSON.stringify(next.questions[0]?.data)).toContain('Столица Италии?')
		// банк показывает одну текущую запись
		expect((await s.c.assessments.questions.list({ courseId: s.course.id })).items).toHaveLength(1)
	})

	it('правка вопроса без попыток — на месте (id тот же)', async () => {
		const s = await setup({ types: ['number'] })
		const stored = s.bank.number?.data as Record<string, unknown>
		const edited = await s.c.assessments.questions.update({
			id: s.ids[0] as string,
			data: { ...stored, points: 5 },
			tags: [],
		})
		expect(edited.id).toBe(s.ids[0])
	})
})

describe('выбор вопросов', () => {
	it('случайные по тегам: только вопросы с тегом, не больше числа, архивные пропускаются', async () => {
		const s = await setup({ types: ['single_choice'] })
		const mk = (prompt: string, tags: string[]) =>
			s.c.assessments.questions.create({
				courseId: s.course.id,
				type: 'single_choice',
				data: { ...(questionTypes.single_choice.example() as Record<string, unknown>), prompt: doc(prompt) },
				tags,
			})
		const a = await mk('Алгебра 1', ['Алгебра'])
		await mk('Алгебра 2', ['Алгебра'])
		await mk('Алгебра 3', ['Алгебра'])
		await mk('Геометрия 1', ['Геометрия'])
		await s.c.assessments.questions.archive({ id: a.id })
		const tags = await s.c.assessments.tags.list({ courseId: s.course.id })
		const algebra = tags.find((x) => x.name === 'Алгебра') as { id: string }
		const block = await s.c.courses.blocks.create({ lessonId: s.lesson.id, type: 'quiz' })
		await s.c.courses.blocks.update({
			id: block.id,
			data: { ...block.data, selection: 'random_by_tags', randomCount: 5, tags: [{ tagId: algebra.id }] },
		})
		await s.c.courses.lessons.publish({ id: s.lesson.id })
		const key = (await s.c.courses.blocks.list({ lessonId: s.lesson.id })).find((b) => b.id === block.id)
			?.blockKey as string
		const view = await s.student.quiz.start({ lessonId: s.lesson.id, blockKey: key })
		const prompts = view.questions.map((q) => JSON.stringify(q.data))
		expect(prompts).toHaveLength(2) // активных Алгебра 2 и 3: пул меньше числа — берутся все
		expect(prompts.every((p) => p.includes('Алгебра'))).toBe(true)
		expect(prompts.some((p) => p.includes('Алгебра 1') || p.includes('Геометрия'))).toBe(false)
	})

	it('в тесте не осталось вопросов (все архивные) — QUIZ_EMPTY', async () => {
		const s = await setup({ types: ['number'] })
		await s.c.assessments.questions.archive({ id: s.ids[0] as string })
		expect(await fails(s.student.quiz.start(ref(s)))).toMatchObject({ code: 'QUIZ_EMPTY' })
	})
})

describe('доступ', () => {
	it('права: сотрудник не проходит тест; чужая попытка и чужой тест — не найдены; закрытый урок и неизвестный блок', async () => {
		const s = await setup({ types: ['number'] })
		expect(await fails(s.t.as('teacher').quiz.start(ref(s)))).toMatchObject({ code: 'NO_PERMISSION' })
		const view = await s.student.quiz.start(ref(s))

		// другой ученик той же школы, не зачисленный
		const stranger = await withTestSchool()
		expect(await fails(stranger.as('student').quiz.attempt({ attemptId: view.attempt.id }))).toMatchObject({
			code: 'ATTEMPT_NOT_FOUND',
		})
		expect(await fails(stranger.as('student').quiz.start(ref(s)))).toMatchObject({ code: 'LESSON_NOT_FOUND' })

		expect(await fails(s.student.quiz.get({ lessonId: s.lesson.id, blockKey: crypto.randomUUID() }))).toMatchObject({
			code: 'QUIZ_NOT_FOUND',
		})
		// результат идущей попытки недоступен
		expect(await fails(s.student.quiz.result({ attemptId: view.attempt.id }))).toMatchObject({
			code: 'ATTEMPT_NOT_FINISHED',
		})
	})

	it('режим «последовательно»: тест в закрытом уроке недоступен', async () => {
		const s = await setup({ types: ['number'] })
		const sec = (await s.c.courses.get({ id: s.course.id })).sections[0]
		const first = await s.c.courses.lessons.create({ sectionId: sec?.id as string, title: 'Первый' })
		await s.c.courses.lessons.move({ id: first.id, sectionId: sec?.id as string, index: 0 })
		const b = await s.c.courses.blocks.create({ lessonId: first.id, type: 'divider' })
		void b
		await s.c.courses.lessons.publish({ id: first.id })
		await withTenant(s.t.school.id, async (tx) => {
			await tx.update(lessons).set({ accessMode: 'sequential' }).where(eq(lessons.id, s.lesson.id))
		})
		expect(await fails(s.student.quiz.start(ref(s)))).toMatchObject({ code: 'LESSON_LOCKED' })
	})
})
