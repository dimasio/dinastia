// Банк вопросов курса (карточка 3.1): создание, правка, архив, теги, фильтры и поиск, права, изоляция школ.
import { ORPCError } from '@orpc/client'
import { afterAll, describe, expect, it } from 'vitest'
import { pool } from '#/kernel/db/client.ts'
import { cleanupTestSchools, type TestSchool, withTestSchool } from '#/test/school.ts'

afterAll(async () => {
	await cleanupTestSchools()
	await pool.end()
})

const failure = (e: unknown) => (e instanceof ORPCError ? (e.data as { code?: string }) : e)
const fails = (p: Promise<unknown>) => p.then(() => 'ok', failure)
const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const single = (prompt: string, points = 1) => ({
	prompt: doc(prompt),
	explanation: null,
	points,
	options: [
		{ body: doc('Верно'), isCorrect: true },
		{ body: doc('Неверно'), isCorrect: false },
	],
})

async function setup() {
	const t = await withTestSchool()
	const c = t.as('teacher')
	const course = await c.courses.create({ title: 'Курс с банком' })
	return { t, c, course }
}
const add = (t: TestSchool, courseId: string, prompt: string, tags: string[] = [], points = 1) =>
	t.as('teacher').assessments.questions.create({ courseId, type: 'single_choice', data: single(prompt, points), tags })

describe('банк вопросов', () => {
	it('создать → список → получить → править → в архив', async () => {
		const { t, c, course } = await setup()
		expect((await c.assessments.questions.list({ courseId: course.id })).total).toBe(0)
		const q = await add(t, course.id, 'Сколько будет два плюс два?', ['Арифметика'], 2)
		expect(q).toMatchObject({ type: 'single_choice', tags: ['Арифметика'], courseId: course.id })

		const list = await c.assessments.questions.list({ courseId: course.id })
		expect(list.items).toMatchObject([
			{ id: q.id, type: 'single_choice', text: 'Сколько будет два плюс два?', points: 2, tags: ['Арифметика'] },
		])
		const full = await c.assessments.questions.get({ id: q.id })
		expect((full.data.options as { isCorrect: boolean }[]).filter((o) => o.isCorrect)).toHaveLength(1)

		const updated = await c.assessments.questions.update({
			id: q.id,
			data: { ...single('Сколько будет три плюс три?', 3), options: full.data.options },
			tags: ['Арифметика', 'Сложение'],
		})
		expect(updated.tags).toEqual(['Арифметика', 'Сложение'])
		expect((await c.assessments.questions.list({ courseId: course.id })).items[0]).toMatchObject({
			text: 'Сколько будет три плюс три?',
			points: 3,
		})

		await c.assessments.questions.archive({ id: q.id })
		expect((await c.assessments.questions.list({ courseId: course.id })).total).toBe(0)
		expect(await fails(c.assessments.questions.get({ id: q.id }))).toMatchObject({ code: 'QUESTION_NOT_FOUND' })
		expect(await fails(c.assessments.questions.archive({ id: q.id }))).toMatchObject({ code: 'QUESTION_NOT_FOUND' })
	})

	it('схема типа проверяется на сервере: нет верного варианта, неизвестный тип, нет курса', async () => {
		const { c, course } = await setup()
		const bad = {
			...single('Вопрос'),
			options: [
				{ body: doc('а'), isCorrect: false },
				{ body: doc('б'), isCorrect: false },
			],
		}
		await expect(
			c.assessments.questions.create({ courseId: course.id, type: 'single_choice', data: bad }),
		).rejects.toBeInstanceOf(Error)
		expect(await fails(c.assessments.questions.create({ courseId: course.id, type: 'nope', data: {} }))).toMatchObject({
			code: 'QUESTION_TYPE_UNKNOWN',
		})
		expect(
			await fails(
				c.assessments.questions.create({ courseId: crypto.randomUUID(), type: 'single_choice', data: single('x') }),
			),
		).toMatchObject({ code: 'COURSE_NOT_FOUND' })
	})

	it('поиск по тексту вопроса (не по служебным ключам), фильтры по типу и тегу, сортировка по баллам', async () => {
		const { t, c, course } = await setup()
		await add(t, course.id, 'Столица Франции', ['география'], 1)
		await add(t, course.id, 'Сколько рёбер у куба', ['геометрия', 'математика'], 3)
		await add(t, course.id, 'Формула воды', [], 2)

		expect((await c.assessments.questions.list({ courseId: course.id, q: 'куба' })).items.map((i) => i.text)).toEqual([
			'Сколько рёбер у куба',
		])
		// служебные слова JSON (paragraph, doc, text) не находятся
		expect((await c.assessments.questions.list({ courseId: course.id, q: 'paragraph' })).total).toBe(0)
		expect((await c.assessments.questions.list({ courseId: course.id, filters: { tag: 'МАТЕМАТИКА' } })).total).toBe(1)
		expect(
			(await c.assessments.questions.list({ courseId: course.id, filters: { type: 'single_choice' } })).total,
		).toBe(3)
		expect((await c.assessments.questions.list({ courseId: course.id, filters: { type: 'open_text' } })).total).toBe(0)
		const byPoints = await c.assessments.questions.list({ courseId: course.id, sort: 'points', dir: 'desc' })
		expect(byPoints.items.map((i) => i.points)).toEqual([3, 2, 1])
		const paged = await c.assessments.questions.list({
			courseId: course.id,
			pageSize: 2,
			page: 2,
			sort: 'points',
			dir: 'desc',
		})
		expect(paged).toMatchObject({ total: 3, items: [{ points: 1 }] })
	})
})

describe('теги', () => {
	it('создаются по имени без учёта регистра; счётчики; переименование; удаление снимает связи', async () => {
		const { t, c, course } = await setup()
		const a = await add(t, course.id, 'Один', ['Алгебра', 'алгебра ', '  Геометрия '])
		expect(a.tags).toEqual(['Алгебра', 'Геометрия']) // дубль без учёта регистра схлопнут, пробелы убраны
		await add(t, course.id, 'Два', ['АЛГЕБРА'])
		const tags = await c.assessments.tags.list({ courseId: course.id })
		expect(tags.map((x) => [x.name, x.count])).toEqual([
			['Алгебра', 2],
			['Геометрия', 1],
		])

		const geo = tags.find((x) => x.name === 'Геометрия') as { id: string }
		expect(await fails(c.assessments.tags.rename({ id: geo.id, name: 'алгебра' }))).toMatchObject({
			code: 'TAG_EXISTS',
		})
		expect(await c.assessments.tags.rename({ id: geo.id, name: 'Планиметрия' })).toMatchObject({
			name: 'Планиметрия',
			count: 1,
		})

		await c.assessments.tags.remove({ id: geo.id })
		expect((await c.assessments.tags.list({ courseId: course.id })).map((x) => x.name)).toEqual(['Алгебра'])
		expect((await c.assessments.questions.get({ id: a.id })).tags).toEqual(['Алгебра']) // вопрос остался
	})

	it('лимиты: не больше 10 тегов, имя до 40 символов; архивные вопросы в счётчик не входят', async () => {
		const { t, c, course } = await setup()
		const eleven = Array.from({ length: 11 }, (_, i) => `т${i}`)
		await expect(add(t, course.id, 'Много', eleven)).rejects.toBeInstanceOf(Error)
		await expect(add(t, course.id, 'Длинный', ['я'.repeat(41)])).rejects.toBeInstanceOf(Error)
		const q = await add(t, course.id, 'Ок', ['один'])
		await c.assessments.questions.archive({ id: q.id })
		expect((await c.assessments.tags.list({ courseId: course.id }))[0]).toMatchObject({ name: 'один', count: 0 })
	})
})

describe('права и изоляция', () => {
	it('куратор читает, но не правит; ученик не видит банк; другая школа не видит', async () => {
		const { t, course } = await setup()
		const q = await add(t, course.id, 'Секретный вопрос')
		const curator = t.as('curator')
		expect((await curator.assessments.questions.list({ courseId: course.id })).total).toBe(1)
		await curator.assessments.questions.get({ id: q.id })
		await curator.assessments.tags.list({ courseId: course.id })
		expect(
			await fails(
				curator.assessments.questions.create({ courseId: course.id, type: 'single_choice', data: single('x') }),
			),
		).toMatchObject({ code: 'NO_PERMISSION' })
		expect(await fails(curator.assessments.questions.archive({ id: q.id }))).toMatchObject({ code: 'NO_PERMISSION' })
		expect(await fails(t.as('student').assessments.questions.list({ courseId: course.id }))).toMatchObject({
			code: 'NO_PERMISSION',
		})

		const other = await withTestSchool()
		expect(await fails(other.as('teacher').assessments.questions.get({ id: q.id }))).toMatchObject({
			code: 'QUESTION_NOT_FOUND',
		})
		expect(await fails(other.as('teacher').assessments.questions.list({ courseId: course.id }))).toMatchObject({
			code: 'COURSE_NOT_FOUND',
		})
	})
})
