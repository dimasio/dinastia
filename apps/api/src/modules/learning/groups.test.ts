// Потоки и область куратора (карточка 4.2): потоки и кураторы, права, зачисление в поток и срок потока, перевод, удаление,
// ссылка в поток; куратор видит учеников, работы и попытки только своих потоков; изоляция школ.
import { questionTypes } from '@dinastia/questions'
import { ORPCError } from '@orpc/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pool } from '#/kernel/db/client.ts'
import { signUp } from '#/test/http.ts'
import { startTestWorker, stopTestWorker } from '#/test/jobs.ts'
import { cleanupTestSchools, expectPermissionMatrix, withTestSchool } from '#/test/school.ts'
import { uniqueEmail } from '#/test/users.ts'

beforeAll(startTestWorker)
afterAll(async () => {
	await stopTestWorker()
	await cleanupTestSchools()
	await pool.end()
})

const failure = (e: unknown) => (e instanceof ORPCError ? (e.data as { code?: string }) : e)
const fails = (p: Promise<unknown>) => p.then(() => 'ok', failure)
const DAY = 24 * 60 * 60 * 1000
const days = (iso: string | Date | null) => Math.round((new Date(iso as string).getTime() - Date.now()) / DAY)
const doc = (text: string) => ({
	type: 'doc' as const,
	content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})

/** Школа с опубликованным курсом: урок с заданием и тестом с развёрнутым вопросом. */
async function setup() {
	const t = await withTestSchool()
	const c = t.as('teacher')
	const course = await c.courses.create({ title: 'Пожарная безопасность' })
	const section = await c.courses.sections.create({ courseId: course.id, title: 'Раздел' })
	const lesson = await c.courses.lessons.create({ sectionId: section.id, title: 'Урок' })
	const assignment = await c.courses.blocks.create({ lessonId: lesson.id, type: 'assignment' })
	await c.courses.blocks.update({
		id: assignment.id,
		data: { ...assignment.data, prompt: doc('Опишите огнетушитель') },
	})
	const open = await c.assessments.questions.create({
		courseId: course.id,
		type: 'open_text',
		data: {
			...(questionTypes.open_text.example() as Record<string, unknown>),
			prompt: doc('Ваши действия при пожаре'),
		},
		tags: [],
	})
	const quiz = await c.courses.blocks.create({ lessonId: lesson.id, type: 'quiz' })
	await c.courses.blocks.update({ id: quiz.id, data: { ...quiz.data, questions: [{ questionId: open.id }] } })
	await c.courses.lessons.publish({ id: lesson.id })
	await c.courses.publish({ id: course.id })
	const blocks = await c.courses.blocks.list({ lessonId: lesson.id })
	const key = (id: string) => blocks.find((b) => b.id === id)?.blockKey as string
	return { t, c, course, lesson, assignmentKey: key(assignment.id), quizKey: key(quiz.id) }
}

type Setup = Awaited<ReturnType<typeof setup>>

const curatorMemberId = async (s: Setup) =>
	(await s.c.learning.groups.curatorOptions()).find((o) => o.email === s.t.people.curator.email)?.memberId as string

/** Новый ученик школы (зарегистрировался, зачислил администратор) — в поток или без потока. */
async function student(s: Setup, groupId?: string) {
	const person = await signUp('st')
	const res = await s.t.as('admin').learning.enrollments.enroll({
		courseId: s.course.id,
		email: person.email,
		...(groupId ? { groupId } : {}),
	})
	return { email: person.email, enrollmentId: res.enrollment?.id as string, client: s.t.as(person) }
}

describe('потоки', () => {
	it('создание с куратором, список, изменение; куратор и ученик не управляют', async () => {
		const s = await setup()
		const curator = await curatorMemberId(s)
		const g = await s.c.learning.groups.create({
			courseId: s.course.id,
			title: 'Поток март',
			startsAt: new Date('2027-03-01T00:00:00Z'),
			curatorIds: [curator],
		})
		expect(g).toMatchObject({ title: 'Поток март', students: 0, accessDays: null, endsAt: null })
		expect(g.curators.map((x) => x.email)).toEqual([s.t.people.curator.email])
		const upd = await s.c.learning.groups.update({ id: g.id, title: 'Поток апрель', accessDays: 30, curatorIds: [] })
		expect(upd).toMatchObject({ title: 'Поток апрель', accessDays: 30, curators: [], startsAt: null })
		expect(await s.c.learning.groups.list({ courseId: s.course.id })).toHaveLength(1)
		await expectPermissionMatrix(s.t, (c) => c.learning.groups.create({ courseId: s.course.id, title: 'Ещё поток' }), {
			allow: ['owner', 'admin', 'teacher'],
			deny: ['curator', 'student'],
		})
	})

	it('кураторы — только активные сотрудники; окончание не раньше старта', async () => {
		const s = await setup()
		const st = await student(s)
		const studentMember = (await s.c.learning.enrollments.list({ courseId: s.course.id })).items[0]
		expect(studentMember?.studentEmail).toBe(st.email)
		const options = await s.c.learning.groups.curatorOptions()
		expect(options.map((o) => o.email)).not.toContain(st.email)
		// id участника-ученика берём из опций нельзя — подставим id зачисления: тоже не сотрудник
		expect(
			await fails(s.c.learning.groups.create({ courseId: s.course.id, title: 'П', curatorIds: [st.enrollmentId] })),
		).toMatchObject({ code: 'NOT_STAFF' })
		expect(
			await fails(
				s.c.learning.groups.create({
					courseId: s.course.id,
					title: 'П',
					startsAt: new Date('2027-03-10'),
					endsAt: new Date('2027-03-01'),
				}),
			),
		).toMatchObject({ code: 'GROUP_DATES' })
	})

	it('зачисление в поток: срок потока от зачисления или от будущего старта; поток другого курса — отказ', async () => {
		const s = await setup()
		const now = await s.c.learning.groups.create({ courseId: s.course.id, title: 'Сейчас', accessDays: 10 })
		const later = await s.c.learning.groups.create({
			courseId: s.course.id,
			title: 'Позже',
			accessDays: 10,
			startsAt: new Date(Date.now() + 5 * DAY),
		})
		const a = await s.c.learning.enrollments.enroll({
			courseId: s.course.id,
			email: s.t.people.student.email,
			groupId: now.id,
		})
		expect(a.enrollment).toMatchObject({ groupId: now.id, groupTitle: 'Сейчас' })
		expect(days(a.enrollment?.expiresAt ?? null)).toBe(10)
		const b = await student(s, later.id)
		const row = (await s.c.learning.enrollments.list({ courseId: s.course.id })).items.find(
			(r) => r.id === b.enrollmentId,
		)
		expect(days(row?.expiresAt ?? null)).toBe(15)

		const other = await s.c.courses.create({ title: 'Другой курс' })
		const foreign = await s.c.learning.groups.create({ courseId: other.id, title: 'Чужой' })
		expect(
			await fails(
				s.c.learning.enrollments.enroll({ courseId: s.course.id, email: uniqueEmail('x'), groupId: foreign.id }),
			),
		).toMatchObject({ code: 'GROUP_NOT_FOUND' })
	})

	it('перевод между потоками и «без потока»; фильтр списка; срок не меняется', async () => {
		const s = await setup()
		const g1 = await s.c.learning.groups.create({ courseId: s.course.id, title: 'Первый' })
		const g2 = await s.c.learning.groups.create({ courseId: s.course.id, title: 'Второй' })
		const st = await student(s, g1.id)
		await student(s)
		const moved = await s.c.learning.enrollments.move({ id: st.enrollmentId, groupId: g2.id })
		expect(moved).toMatchObject({ groupId: g2.id, groupTitle: 'Второй' })
		const list = (groupId: string) =>
			s.c.learning.enrollments.list({ courseId: s.course.id, filters: { groupId } }).then((p) => p.total)
		expect([await list(g1.id), await list(g2.id), await list('none')]).toEqual([0, 1, 1])
		expect(await s.c.learning.enrollments.move({ id: st.enrollmentId, groupId: null })).toMatchObject({
			groupId: null,
			groupTitle: null,
		})
		expect(
			await fails(s.t.as('curator').learning.enrollments.move({ id: st.enrollmentId, groupId: g1.id })),
		).toMatchObject({ code: 'NO_PERMISSION' })
	})

	it('удаление потока: ученики и ссылки остаются без потока', async () => {
		const s = await setup()
		const g = await s.c.learning.groups.create({ courseId: s.course.id, title: 'Удаляемый' })
		const st = await student(s, g.id)
		const link = await s.c.learning.invites.create({ courseId: s.course.id, groupId: g.id })
		expect(link.invite).toMatchObject({ groupId: g.id, groupTitle: 'Удаляемый' })
		await s.c.learning.groups.remove({ id: g.id })
		const row = (await s.c.learning.enrollments.list({ courseId: s.course.id })).items.find(
			(r) => r.id === st.enrollmentId,
		)
		expect(row).toMatchObject({ groupId: null, status: 'active' })
		expect((await s.c.learning.invites.list({ courseId: s.course.id }))[0]).toMatchObject({ groupId: null })
		expect(await s.c.learning.groups.list({ courseId: s.course.id })).toEqual([])
	})

	it('ссылка-приглашение в поток: принявший попадает в поток', async () => {
		const s = await setup()
		const g = await s.c.learning.groups.create({ courseId: s.course.id, title: 'По ссылке' })
		const { url } = await s.c.learning.invites.create({ courseId: s.course.id, groupId: g.id })
		const token = url.split('/join/')[1] as string
		const joiner = await signUp('joiner')
		await s.t.as(joiner).join.accept({ token })
		const row = (await s.c.learning.enrollments.list({ courseId: s.course.id, q: joiner.email })).items[0]
		expect(row).toMatchObject({ groupId: g.id, source: 'link' })
	})
})

describe('область куратора', () => {
	it('ученики, потоки, очередь, работа, решение, оценка теста — только свои потоки', async () => {
		const s = await setup()
		const curator = await curatorMemberId(s)
		const mine = await s.c.learning.groups.create({ courseId: s.course.id, title: 'Мой', curatorIds: [curator] })
		const theirs = await s.c.learning.groups.create({ courseId: s.course.id, title: 'Чужой' })
		const a = await student(s, mine.id)
		const b = await student(s, theirs.id)
		await student(s) // без потока
		const cur = s.t.as('curator')

		const visible = await cur.learning.enrollments.list({ courseId: s.course.id })
		expect(visible.items.map((r) => r.studentEmail)).toEqual([a.email])
		expect((await s.c.learning.enrollments.list({ courseId: s.course.id })).total).toBe(3)
		expect((await cur.learning.groups.list({ courseId: s.course.id })).map((g) => g.title)).toEqual(['Мой'])

		// задания: обе работы сдаются, куратор видит и решает только свою
		const sub = async (who: typeof a) =>
			(
				await who.client.assignment.submit({
					lessonId: s.lesson.id,
					blockKey: s.assignmentKey,
					body: doc('Огнетушитель ОП-4'),
					fileIds: [],
				})
			).submission?.id as string
		const subA = await sub(a)
		const subB = await sub(b)
		const queue = await cur.review.list({ filters: { kind: 'assignment' } })
		expect(queue.items.map((r) => r.id)).toEqual([subA])
		expect(await fails(cur.review.get({ submissionId: subB }))).toMatchObject({ code: 'SUBMISSION_NOT_FOUND' })
		expect(await fails(cur.assignment.review({ submissionId: subB, decision: 'accept', comment: null }))).toMatchObject(
			{ code: 'SUBMISSION_NOT_FOUND' },
		)
		expect(await cur.assignment.review({ submissionId: subA, decision: 'accept', comment: null })).toMatchObject({
			status: 'accepted',
		})
		expect((await s.t.as('teacher').review.list({ filters: { kind: 'assignment' } })).total).toBe(2)

		// тест с развёрнутым ответом: оценка — только своему ученику
		const attempt = async (who: typeof a) => {
			const view = await who.client.quiz.start({ lessonId: s.lesson.id, blockKey: s.quizKey })
			for (const q of view.questions)
				await who.client.quiz.answer({
					attemptId: view.attempt.id,
					attemptQuestionId: q.id,
					response: { text: 'Позвоню 101' },
				})
			await who.client.quiz.submit({ attemptId: view.attempt.id })
			return view
		}
		const va = await attempt(a)
		const vb = await attempt(b)
		expect(await fails(cur.review.attempt({ attemptId: vb.attempt.id }))).toMatchObject({ code: 'ATTEMPT_NOT_FOUND' })
		expect(
			await fails(
				cur.review.gradeAttempt({
					attemptId: vb.attempt.id,
					grades: [{ attemptQuestionId: vb.questions[0]?.id as string, score: 1, feedback: null }],
				}),
			),
		).toMatchObject({ code: 'ATTEMPT_NOT_FOUND' })
		const graded = await cur.review.gradeAttempt({
			attemptId: va.attempt.id,
			grades: [{ attemptQuestionId: va.questions[0]?.id as string, score: 1, feedback: null }],
		})
		expect(graded.attempt.status).toBe('graded')
	})

	it('изоляция школ: поток другой школы не найден', async () => {
		const s = await setup()
		const g = await s.c.learning.groups.create({ courseId: s.course.id, title: 'Наш' })
		const other = await withTestSchool()
		expect(await fails(other.as('teacher').learning.groups.remove({ id: g.id }))).toMatchObject({
			code: 'GROUP_NOT_FOUND',
		})
		expect(await fails(other.as('teacher').learning.groups.list({ courseId: s.course.id }))).toMatchObject({
			code: 'COURSE_NOT_FOUND',
		})
	})
})
