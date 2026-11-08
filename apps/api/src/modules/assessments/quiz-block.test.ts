// Блок «Тест» (карточка 3.3, часть а): сохранение настроек и выбора вопросов, публикация, замечания, что видит ученик,
// подмена вопроса его ревизией при выборе.
import { ORPCError } from '@orpc/client'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { pool } from '#/kernel/db/client.ts'
import { withTenant } from '#/kernel/db/tenant.ts'
import { log } from '#/kernel/log.ts'
import { members } from '#/kernel/members/schema.ts'
import { reviseQuestion } from '#/kernel/questions/questions.ts'
import { tenantCtx } from '#/kernel/tenant-ctx.ts'
import { cleanupTestSchools, type TestSchool, withTestSchool } from '#/test/school.ts'
import { enrollMember } from '../learning/service.ts'
import { lookupQuestions } from './question.service.ts'

afterAll(async () => {
	await cleanupTestSchools()
	await pool.end()
})

const failure = (e: unknown) => (e instanceof ORPCError ? (e.data as { code?: string; [k: string]: unknown }) : e)
const fails = (p: Promise<unknown>) => p.then(() => 'ok', failure)
const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const single = (prompt: string) => ({
	prompt: doc(prompt),
	explanation: null,
	points: 1,
	options: [
		{ body: doc('Верно'), isCorrect: true },
		{ body: doc('Неверно'), isCorrect: false },
	],
})

async function setup() {
	const t = await withTestSchool()
	const c = t.as('teacher')
	const course = await c.courses.create({ title: 'Курс с тестом' })
	const section = await c.courses.sections.create({ courseId: course.id, title: 'Раздел' })
	const lesson = await c.courses.lessons.create({ sectionId: section.id, title: 'Урок' })
	const q = (prompt: string, tags: string[] = []) =>
		c.assessments.questions.create({ courseId: course.id, type: 'single_choice', data: single(prompt), tags })
	return { t, c, course, lesson, q }
}

describe('блок «Тест»: хранение', () => {
	it('настройки по умолчанию; сохранение настроек и списка вопросов; порядок и ключи сохраняются', async () => {
		const { c, lesson, q } = await setup()
		const [a, b] = await Promise.all([q('Первый'), q('Второй')])
		const block = await c.courses.blocks.create({ lessonId: lesson.id, type: 'quiz' })
		expect(block.data).toMatchObject({
			selection: 'fixed',
			attemptsLimit: 0,
			passScorePct: 60,
			timeLimitSec: null,
			shuffleQuestions: false,
			shuffleOptions: false,
			showCorrect: 'after_submit',
			questions: [],
			tags: [],
		})
		const saved = await c.courses.blocks.update({
			id: block.id,
			data: {
				...block.data,
				attemptsLimit: 3,
				passScorePct: 80,
				timeLimitSec: 600,
				shuffleQuestions: true,
				showCorrect: 'after_pass',
				questions: [{ questionId: b.id }, { questionId: a.id }],
			},
		})
		expect(saved.data).toMatchObject({
			attemptsLimit: 3,
			passScorePct: 80,
			timeLimitSec: 600,
			showCorrect: 'after_pass',
		})
		const ids = (saved.data.questions as { questionId: string; key: string }[]).map((x) => x.questionId)
		expect(ids).toEqual([b.id, a.id]) // порядок автора
		const reread = (await c.courses.blocks.list({ lessonId: lesson.id })).find((x) => x.id === block.id)
		expect(((reread?.data.questions ?? []) as { questionId: string }[]).map((x) => x.questionId)).toEqual([b.id, a.id])
	})

	it('значения вне границ — ошибка схемы: время меньше минуты, проходной больше 100, больше 50 вопросов', async () => {
		const { c, lesson } = await setup()
		const block = await c.courses.blocks.create({ lessonId: lesson.id, type: 'quiz' })
		const bad = (patch: Record<string, unknown>) =>
			expect(c.courses.blocks.update({ id: block.id, data: { ...block.data, ...patch } })).rejects.toMatchObject({
				status: 400,
			})
		await bad({ timeLimitSec: 30 })
		await bad({ passScorePct: 101 })
		await bad({ attemptsLimit: -1 })
		await bad({ questions: Array.from({ length: 51 }, () => ({ questionId: crypto.randomUUID() })) })
		await bad({ showCorrect: 'always' })
	})

	it('замечания: нет вопросов / нет тегов — урок не публикуется; с вопросами — публикуется', async () => {
		const { c, lesson, q } = await setup()
		const block = await c.courses.blocks.create({ lessonId: lesson.id, type: 'quiz' })
		expect(await fails(c.courses.lessons.publish({ id: lesson.id }))).toMatchObject({
			code: 'LESSON_HAS_ISSUES',
			blocks: [{ type: 'quiz', issues: ['noQuestions'] }],
		})
		await c.courses.blocks.update({ id: block.id, data: { ...block.data, selection: 'random_by_tags' } })
		expect(await fails(c.courses.lessons.publish({ id: lesson.id }))).toMatchObject({
			blocks: [{ type: 'quiz', issues: ['noTags'] }],
		})
		const x = await q('Вопрос', ['Тема'])
		await c.courses.blocks.update({
			id: block.id,
			data: { ...block.data, selection: 'fixed', questions: [{ questionId: x.id }] },
		})
		await c.courses.lessons.publish({ id: lesson.id })
	})

	it('случайные по тегам: теги сохраняются; тег удалён — связь снята', async () => {
		const { c, course, lesson, q } = await setup()
		await q('Вопрос', ['Алгебра', 'Геометрия'])
		const tags = await c.assessments.tags.list({ courseId: course.id })
		const block = await c.courses.blocks.create({ lessonId: lesson.id, type: 'quiz' })
		const saved = await c.courses.blocks.update({
			id: block.id,
			data: { ...block.data, selection: 'random_by_tags', randomCount: 2, tags: tags.map((x) => ({ tagId: x.id })) },
		})
		expect((saved.data.tags as { tagId: string }[]).map((x) => x.tagId).sort()).toEqual(tags.map((x) => x.id).sort())
		const first = tags[0] as { id: string }
		await c.assessments.tags.remove({ id: first.id })
		const reread = (await c.courses.blocks.list({ lessonId: lesson.id })).find((x) => x.id === block.id)
		expect(((reread?.data.tags ?? []) as unknown[]).length).toBe(tags.length - 1)
	})
})

describe('блок «Тест»: что видит ученик', () => {
	it('в плеере — настройки и число вопросов; список вопросов и теги не раскрываются', async () => {
		const { t, c, course, lesson, q } = await setup()
		const [a, b] = await Promise.all([q('Первый'), q('Второй')])
		const block = await c.courses.blocks.create({ lessonId: lesson.id, type: 'quiz' })
		await c.courses.blocks.update({
			id: block.id,
			data: {
				...block.data,
				attemptsLimit: 2,
				timeLimitSec: 300,
				questions: [{ questionId: a.id }, { questionId: b.id }],
			},
		})
		await c.courses.lessons.publish({ id: lesson.id })
		await c.courses.publish({ id: course.id })
		await enroll(t, course.id)
		const page = await t.as('student').learn.lessons.get({ lessonId: lesson.id })
		const quiz = page.blocks.find((x) => x.type === 'quiz')
		expect(quiz?.data).toEqual({
			selection: 'fixed',
			questionsCount: 2,
			attemptsLimit: 2,
			passScorePct: 60,
			timeLimitSec: 300,
			showCorrect: 'after_submit',
		})
		expect(JSON.stringify(quiz)).not.toContain(a.id)
	})
})

describe('выбор вопросов: ревизии', () => {
	it('lookup подменяет вопрос текущей ревизией; архивный и чужой — null', async () => {
		const { t, c, course, q } = await setup()
		const a = await q('Старая формулировка')
		const archived = await q('Уберём')
		await c.assessments.questions.archive({ id: archived.id })
		const revisedId = await withTenant(t.school.id, async (tx) => {
			const ctx = tenantCtx(tx, t.school, { now: () => new Date(), log })
			const r = await reviseQuestion(ctx, a.id, { ...single('Новая формулировка'), options: a.data.options as never[] })
			return r.id
		})
		const ghost = crypto.randomUUID()
		const res = await c.assessments.questions.lookup({ ids: [a.id, archived.id, ghost] })
		expect(res[0]?.question).toMatchObject({ id: revisedId, text: 'Новая формулировка' })
		expect(res[0]?.requestedId).toBe(a.id)
		expect(res[1]?.question).toBeNull()
		expect(res[2]?.question).toBeNull()
		void course
		// другая школа вопроса не видит
		const other = await withTestSchool()
		expect((await other.as('teacher').assessments.questions.lookup({ ids: [a.id] }))[0]?.question).toBeNull()
		// права: куратор читает, ученик — нет
		expect((await t.as('curator').assessments.questions.lookup({ ids: [a.id] })).length).toBe(1)
		expect(await fails(t.as('student').assessments.questions.lookup({ ids: [a.id] }))).toMatchObject({
			code: 'NO_PERMISSION',
		})
		void lookupQuestions
	})
})

async function enroll(t: TestSchool, courseId: string) {
	return withTenant(t.school.id, async (tx) => {
		const [m] = await tx.select().from(members).where(eq(members.userId, t.people.student.id))
		const ctx = tenantCtx(tx, t.school, { now: () => new Date(), log })
		return enrollMember(ctx, { memberId: (m as { id: string }).id, courseId })
	})
}
