// Банк вопросов (D-035): данные типа в общих таблицах, правка на месте и ревизия, публичные данные и проверка,
// чужие колонки, изоляция школ, удаление школы с ревизиями.
import { randomUUID } from 'node:crypto'
import { questionItems, questions, schools } from '@dinastia/db'
import { eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ZodError } from 'zod'
import { courseIn } from '#/test/courses.ts'
import type { BaseCtx } from '../context.ts'
import { db, pool } from '../db/client.ts'
import { withTenant } from '../db/tenant.ts'
import { AppError } from '../errors.ts'
import { log } from '../log.ts'
import { tenantCtx } from '../tenant-ctx.ts'
import {
	archiveQuestion,
	createQuestion,
	getQuestion,
	gradeAnswer,
	listQuestions,
	publicQuestion,
	reviewQuestion,
	reviseQuestion,
	updateQuestion,
} from './questions.ts'

type School = { id: string; slug: string; name: string }
let a: School
let b: School
const inSchool = <T>(s: School, fn: (ctx: BaseCtx) => Promise<T>) =>
	withTenant(s.id, (tx) => fn(tenantCtx(tx, s, { now: () => new Date(), log })))

const doc = (text: string) => ({
	type: 'doc' as const,
	content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})
const question = (correct = 1) => ({
	prompt: doc('Столица Франции?'),
	explanation: doc('Париж — столица с 987 года.'),
	points: 3,
	options: ['Лион', 'Париж', 'Марсель'].map((t, i) => ({ body: doc(t), isCorrect: i === correct })),
})
type Option = { id: string; body: unknown; isCorrect: boolean }
const optionsOf = (q: { data: Record<string, unknown> }) => q.data.options as Option[]

async function newSchool(prefix: string) {
	const [s] = await db
		.insert(schools)
		.values({ slug: `${prefix}-${randomUUID().slice(0, 8)}`, name: prefix })
		.returning({ id: schools.id, slug: schools.slug, name: schools.name })
	if (!s) throw new Error('школа не создана')
	return s
}

beforeAll(async () => {
	a = await newSchool('qa')
	b = await newSchool('qb')
})

afterAll(async () => {
	await db.delete(schools).where(inArray(schools.id, [a.id, b.id]))
	await pool.end()
})

describe('вопрос single_choice в банке', () => {
	it('создание и чтение: элементы по порядку с id; чужие для типа колонки — по умолчанию', async () => {
		const courseId = await courseIn(a.id)
		await inSchool(a, async (ctx) => {
			const q = await createQuestion(ctx, {
				courseId,
				type: 'single_choice',
				data: { ...question(), numberAnswer: 42, scoring: 'partial' },
			})
			expect(q).toMatchObject({ courseId, type: 'single_choice', isCurrent: true, revisionOf: null, archivedAt: null })
			expect(optionsOf(q).map((o) => [o.isCorrect, o.id.length])).toEqual([
				[false, 36],
				[true, 36],
				[false, 36],
			])
			expect(q.data).not.toHaveProperty('numberAnswer')
			const [row] = await ctx.db.select().from(questions).where(eq(questions.id, q.id))
			expect([row?.numberAnswer, row?.scoring, row?.caseSensitive]).toEqual([null, 'all_or_nothing', false])
			expect((await listQuestions(ctx, courseId)).map((x) => x.id)).toEqual([q.id])
		})
	})

	it('ученику — без верных ответов и пояснения; проверка ответа; разбор', async () => {
		await inSchool(a, async (ctx) => {
			const q = await createQuestion(ctx, { courseId: await courseIn(a.id), type: 'single_choice', data: question() })
			const pub = publicQuestion(q) as { options: Record<string, unknown>[] }
			expect(JSON.stringify(pub)).not.toContain('isCorrect')
			expect(pub).not.toHaveProperty('explanation')
			expect(pub.options.map((o) => Object.keys(o).sort())).toEqual([
				['body', 'id'],
				['body', 'id'],
				['body', 'id'],
			])

			const [lyon, paris] = optionsOf(q)
			expect(gradeAnswer(q, { selected: paris?.id })).toEqual({ score: 3, max: 3, isCorrect: true })
			expect(gradeAnswer(q, { selected: lyon?.id })).toEqual({ score: 0, max: 3, isCorrect: false })
			expect(gradeAnswer(q, { selected: null })).toEqual({ score: 0, max: 3, isCorrect: false })
			expect(gradeAnswer(q, { selected: randomUUID() })).toMatchObject({ score: 0 })
			expect(() => gradeAnswer(q, { selected: 'не id' })).toThrow(ZodError)
			expect(reviewQuestion(q)).toEqual({ correct: [paris?.id], explanation: question().explanation })
		})
	})

	it('правка на месте сохраняет id своих элементов; чужие id не принимаются', async () => {
		await inSchool(a, async (ctx) => {
			const q = await createQuestion(ctx, { courseId: await courseIn(a.id), type: 'single_choice', data: question() })
			const [lyon, paris, marseille] = optionsOf(q) as [Option, Option, Option]
			const stranger = randomUUID()
			const updated = await updateQuestion(ctx, q.id, {
				...question(),
				points: 5,
				options: [
					{ ...marseille, isCorrect: true },
					{ ...paris, isCorrect: false },
					{ id: stranger, body: doc('Ницца'), isCorrect: false },
				],
			})
			const ids = optionsOf(updated).map((o) => o.id)
			expect(updated.id).toBe(q.id)
			expect(updated.data.points).toBe(5)
			expect(ids.slice(0, 2)).toEqual([marseille.id, paris.id])
			expect(ids[2]).not.toBe(stranger)
			expect(ids).not.toContain(lyon.id)
		})
	})

	it('ревизия: прежняя неизменна и не текущая, у новой элементы с новыми id; правка прежней — ошибка', async () => {
		const courseId = await courseIn(a.id)
		await inSchool(a, async (ctx) => {
			const v1 = await createQuestion(ctx, { courseId, type: 'single_choice', data: question(1) })
			const v2 = await reviseQuestion(ctx, v1.id, { ...question(2), points: 1 })
			expect(v2).toMatchObject({ revisionOf: v1.id, isCurrent: true, courseId })
			const old = await getQuestion(ctx, v1.id)
			expect(old.isCurrent).toBe(false)
			expect(old.data).toEqual(v1.data)
			expect(optionsOf(v2).map((o) => o.id)).not.toContain(optionsOf(v1)[0]?.id)
			expect((await listQuestions(ctx, courseId)).map((q) => q.id)).toEqual([v2.id])

			await expect(updateQuestion(ctx, v1.id, question())).rejects.toMatchObject({ code: 'QUESTION_NOT_CURRENT' })
			await expect(reviseQuestion(ctx, v1.id, question())).rejects.toMatchObject({ code: 'QUESTION_NOT_CURRENT' })
			await archiveQuestion(ctx, v2.id)
			expect(await listQuestions(ctx, courseId)).toEqual([])
			await expect(updateQuestion(ctx, v2.id, question())).rejects.toMatchObject({ code: 'QUESTION_ARCHIVED' })
		})
	})

	it('неверные данные и неизвестный тип — ошибки; два верных варианта — NEED_ONE_CORRECT', async () => {
		await inSchool(a, async (ctx) => {
			const two = { ...question(), options: question().options.map((o) => ({ ...o, isCorrect: true })) }
			const err = await createQuestion(ctx, { courseId: await courseIn(a.id), type: 'single_choice', data: two }).catch(
				(e) => e,
			)
			expect(err).toBeInstanceOf(ZodError)
			expect((err as ZodError).issues[0]?.message).toBe('NEED_ONE_CORRECT')
			await expect(
				createQuestion(ctx, { courseId: await courseIn(a.id), type: 'essay', data: question() }),
			).rejects.toBeInstanceOf(AppError)
			await expect(getQuestion(ctx, randomUUID())).rejects.toMatchObject({ code: 'QUESTION_NOT_FOUND' })
		})
	})
})

describe('изоляция и удаление', () => {
	it('другая школа не видит вопросов; удаление школы снимает вопросы со всеми ревизиями и элементами', async () => {
		const c = await newSchool('qc')
		const courseId = await courseIn(c.id)
		const v1 = await inSchool(c, (ctx) => createQuestion(ctx, { courseId, type: 'single_choice', data: question() }))
		await inSchool(c, (ctx) => reviseQuestion(ctx, v1.id, question(0)))
		expect(await inSchool(b, (ctx) => listQuestions(ctx, courseId))).toEqual([])
		await expect(inSchool(b, (ctx) => getQuestion(ctx, v1.id))).rejects.toMatchObject({ code: 'QUESTION_NOT_FOUND' })

		await db.delete(schools).where(eq(schools.id, c.id))
		const left = await withTenant(c.id, (tx) => tx.select().from(questionItems))
		expect(left).toEqual([])
	})
})
