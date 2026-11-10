// Очередь проверки и переписка (карточка 3.5): очередь с фильтрами и порядком, область и права, работа целиком, реплики
// проверяющего и ученика, файлы комментариев, письмо о результате.
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
import { type Client, cleanupTestSchools, withTestSchool } from '#/test/school.ts'
import { enrollMember } from '../learning/service.ts'
import { intoCuratorGroup } from '../learning/testing.ts'

beforeAll(startTestWorker)
afterAll(async () => {
	await stopTestWorker()
	await cleanupTestSchools()
	await pool.end()
})

const failure = (e: unknown) => (e instanceof ORPCError ? (e.data as { code?: string; [k: string]: unknown }) : e)
const fails = (p: Promise<unknown>) => p.then(() => 'ok', failure)
const doc = (text: string) => ({
	type: 'doc' as const,
	content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})
const COMMENT = 'assessments.comment-file'

/** Курс с `n` уроками, в каждом — задание; ученик зачислен. */
async function setup(n = 1, settings: Record<string, unknown> = {}) {
	const t = await withTestSchool()
	const c = t.as('teacher')
	const course = await c.courses.create({ title: 'Курс с заданиями' })
	const section = await c.courses.sections.create({ courseId: course.id, title: 'Раздел' })
	const refs: { lessonId: string; blockKey: string }[] = []
	for (let i = 0; i < n; i++) {
		const lesson = await c.courses.lessons.create({ sectionId: section.id, title: `Урок ${i + 1}` })
		const block = await c.courses.blocks.create({ lessonId: lesson.id, type: 'assignment' })
		await c.courses.blocks.update({
			id: block.id,
			data: { ...block.data, prompt: doc(`Задание ${i + 1}`), ...settings },
		})
		await c.courses.lessons.publish({ id: lesson.id })
		const key = (await c.courses.blocks.list({ lessonId: lesson.id })).find((b) => b.id === block.id)
			?.blockKey as string
		refs.push({ lessonId: lesson.id, blockKey: key })
	}
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
	return { t, c, course, refs, student: t.as('student') }
}

async function upload(c: Client, name = 'файл.png', mime = 'image/png', purpose = COMMENT) {
	const body = new TextEncoder().encode('данные')
	const u = await c.files.createUpload({ purpose, name, mime, size: body.length })
	expect((await fetch(u.uploadUrl, { method: 'PUT', headers: u.headers, body })).ok).toBe(true)
	return (await c.files.complete({ id: u.fileId })).id
}

type Setup = Awaited<ReturnType<typeof setup>>
const submit = async (s: Setup, i: number, text = 'Работа') =>
	(
		await s.student.assignment.submit({
			...(s.refs[i] as { lessonId: string; blockKey: string }),
			body: doc(text),
			fileIds: [],
		})
	).submission?.id as string

describe('очередь', () => {
	it('черновиков нет; «на проверке» сверху, дальше по дате; строка содержит ученика, курс, урок', async () => {
		const s = await setup(3)
		await s.student.assignment.saveDraft({
			...(s.refs[2] as { lessonId: string; blockKey: string }),
			body: doc('Черновик'),
			fileIds: [],
		})
		const first = await submit(s, 0)
		const second = await submit(s, 1)
		await s.t.as('teacher').assignment.review({ submissionId: first, decision: 'accept', comment: null })
		const q = await s.t.as('teacher').review.list({})
		expect(q.total).toBe(2) // черновик не виден
		// «на проверке» (вторая) выше принятой (первой), хотя отправлена позже
		expect(q.items.map((x) => x.id)).toEqual([second, first])
		expect(q.items[0]).toMatchObject({
			studentName: expect.any(String),
			courseTitle: 'Курс с заданиями',
			lessonTitle: 'Урок 2',
			status: 'submitted',
			revision: 1,
		})
		expect(q.items[0]?.submittedAt).not.toBeNull()
	})

	it('фильтры «статус» и «курс», поиск по ученику, страницы', async () => {
		const s = await setup(3)
		const a = await submit(s, 0)
		await submit(s, 1)
		await submit(s, 2)
		const t = s.t.as('curator')
		await s.t.as('teacher').assignment.review({ submissionId: a, decision: 'reject', comment: doc('Не по теме') })
		expect((await t.review.list({ filters: { status: 'submitted' } })).total).toBe(2)
		expect((await t.review.list({ filters: { status: 'rejected' } })).items.map((x) => x.id)).toEqual([a])
		expect((await t.review.list({ filters: { status: 'accepted' } })).total).toBe(0)
		expect((await t.review.list({ filters: { courseId: s.course.id } })).total).toBe(3)
		expect((await t.review.list({ filters: { courseId: crypto.randomUUID() } })).total).toBe(0)
		const email = s.t.people.student.email
		expect((await t.review.list({ q: email.slice(0, 6) })).total).toBe(3)
		expect((await t.review.list({ q: 'нет-такого-ученика' })).total).toBe(0)
		const page = await t.review.list({ pageSize: 2, page: 2 })
		expect(page).toMatchObject({ total: 3, page: 2 })
		expect(page.items).toHaveLength(1)
	})

	it('права: куратор, преподаватель и администратор видят очередь; ученик — нет; чужая школа — пустая', async () => {
		const s = await setup()
		await submit(s, 0)
		for (const role of ['curator', 'teacher', 'admin', 'owner'] as const)
			expect((await s.t.as(role).review.list({})).total).toBe(1)
		expect(await fails(s.student.review.list({}))).toMatchObject({ code: 'NO_PERMISSION' })
		const other = await withTestSchool()
		expect((await other.as('curator').review.list({})).total).toBe(0)
	})
})

describe('работа целиком и решение куратором', () => {
	it('review.get: ответ, ученик, курс, урок, формулировка; черновик и чужая школа — не найдены; куратор решает', async () => {
		const s = await setup()
		const ref = s.refs[0] as { lessonId: string; blockKey: string }
		const draft = await s.student.assignment.saveDraft({ ...ref, body: doc('Черновик'), fileIds: [] })
		const curator = s.t.as('curator')
		expect(await fails(curator.review.get({ submissionId: draft.submission?.id as string }))).toMatchObject({
			code: 'SUBMISSION_NOT_FOUND',
		})
		const id = await submit(s, 0, 'Мой ответ')
		const detail = await curator.review.get({ submissionId: id })
		expect(detail).toMatchObject({
			course: { title: 'Курс с заданиями' },
			lesson: { title: 'Урок 1' },
			submission: { status: 'submitted', revision: 1 },
		})
		expect(JSON.stringify(detail.prompt)).toContain('Задание 1')
		expect(JSON.stringify(detail.submission.body)).toContain('Мой ответ')

		const other = await withTestSchool()
		expect(await fails(other.as('curator').review.get({ submissionId: id }))).toMatchObject({
			code: 'SUBMISSION_NOT_FOUND',
		})
		// куратор возвращает на доработку, затем принимает (демо фазы)
		expect(
			await curator.assignment.review({ submissionId: id, decision: 'needs_revision', comment: doc('Доработайте') }),
		).toMatchObject({ status: 'needs_revision' })
		await s.student.assignment.submit({ ...ref, body: doc('Исправил'), fileIds: [] })
		expect(await curator.assignment.review({ submissionId: id, decision: 'accept', comment: null })).toMatchObject({
			status: 'accepted',
		})
	})
})

describe('переписка', () => {
	it('реплика проверяющего без решения: статус не меняется, ученик видит автора и роль', async () => {
		const s = await setup()
		const id = await submit(s, 0)
		const curator = s.t.as('curator')
		expect(await fails(curator.review.comment({ submissionId: id, body: null, fileIds: [] }))).toMatchObject({
			code: 'COMMENT_REQUIRED',
		})
		const after = await curator.review.comment({ submissionId: id, body: doc('Уточните размер холста'), fileIds: [] })
		expect(after.submission.status).toBe('submitted')
		expect(after.submission.comments).toMatchObject([{ authorRole: 'curator', authorName: expect.any(String) }])
		const seen = await s.student.assignment.get(s.refs[0] as { lessonId: string; blockKey: string })
		expect(JSON.stringify(seen.submission?.comments)).toContain('Уточните размер холста')
	})

	it('ответ ученика: в «на проверке» и «нужна доработка»; не в конечных и не без сдачи; статус не меняется', async () => {
		const s = await setup()
		const ref = s.refs[0] as { lessonId: string; blockKey: string }
		expect(await fails(s.student.assignment.reply({ ...ref, body: doc('Привет'), fileIds: [] }))).toMatchObject({
			code: 'SUBMISSION_NOT_FOUND',
		})
		await s.student.assignment.saveDraft({ ...ref, body: doc('Черновик'), fileIds: [] })
		expect(await fails(s.student.assignment.reply({ ...ref, body: doc('Привет'), fileIds: [] }))).toMatchObject({
			code: 'SUBMISSION_STATE',
		})
		const id = await submit(s, 0)
		const replied = await s.student.assignment.reply({ ...ref, body: doc('Вопрос по заданию'), fileIds: [] })
		expect(replied.submission).toMatchObject({ status: 'submitted' })
		expect(replied.submission?.comments).toMatchObject([{ authorRole: 'student' }])
		expect(await fails(s.student.assignment.reply({ ...ref, body: null, fileIds: [] }))).toMatchObject({
			code: 'COMMENT_REQUIRED',
		})

		const teacher = s.t.as('teacher')
		await teacher.assignment.review({ submissionId: id, decision: 'needs_revision', comment: doc('Переделайте') })
		await s.student.assignment.reply({ ...ref, body: doc('Поняла'), fileIds: [] }) // в доработке — можно
		expect(
			await fails(teacher.assignment.review({ submissionId: id, decision: 'reject', comment: doc('Отклоняю') })),
		).toMatchObject({ code: 'SUBMISSION_STATE' }) // не отправлена повторно — нельзя
		await s.student.assignment.submit({ ...ref, body: doc('Исправила'), fileIds: [] })
		await teacher.assignment.review({ submissionId: id, decision: 'accept', comment: null })
		expect(await fails(s.student.assignment.reply({ ...ref, body: doc('Спасибо'), fileIds: [] }))).toMatchObject({
			code: 'SUBMISSION_STATE',
		})
		// проверяющий в конечном статусе писать может — это не меняет работу
		const late = await teacher.review.comment({ submissionId: id, body: doc('Молодец'), fileIds: [] })
		expect(late.submission.status).toBe('accepted')
		// проверяющий видит реплики обеих сторон по времени
		expect(late.submission.comments.map((c) => c.authorRole)).toEqual(['student', 'teacher', 'student', 'teacher'])
	})

	it('файлы комментариев: свои, готовые, нужного назначения, не больше 3; ссылки скачивания у обеих сторон', async () => {
		const s = await setup()
		const ref = s.refs[0] as { lessonId: string; blockKey: string }
		const id = await submit(s, 0)
		const curator = s.t.as('curator')
		const sFile = await upload(s.student, 'вопрос.png')
		const reply = await s.student.assignment.reply({ ...ref, body: null, fileIds: [sFile] })
		const files = reply.submission?.comments[0]?.files
		expect(files?.map((f) => f.name)).toEqual(['вопрос.png'])
		expect(await (await fetch(files?.[0]?.url ?? '')).text()).toBe('данные')
		const cFile = await upload(curator, 'ответ.pdf', 'application/pdf')
		const withFile = await curator.review.comment({ submissionId: id, body: doc('Смотрите образец'), fileIds: [cFile] })
		expect(withFile.submission.comments.map((c) => c.files.map((f) => f.name))).toEqual([['вопрос.png'], ['ответ.pdf']])

		const wrongPurpose = await upload(s.student, 'я.png', 'image/png', 'schools.avatar')
		const strangers = await upload(curator, 'чужой.png')
		const many = await Promise.all([1, 2, 3, 4].map((i) => upload(s.student, `f${i}.png`)))
		expect(await fails(s.student.assignment.reply({ ...ref, body: doc('x'), fileIds: [wrongPurpose] }))).toMatchObject({
			code: 'FILE_INVALID',
		})
		expect(await fails(s.student.assignment.reply({ ...ref, body: doc('x'), fileIds: [strangers] }))).toMatchObject({
			code: 'FILE_INVALID',
		})
		await expect(s.student.assignment.reply({ ...ref, body: doc('x'), fileIds: many })).rejects.toMatchObject({
			status: 400,
		})
	})
})

describe('решение с файлом', () => {
	it('«на доработку» с файлом без текста допустимо; без текста и файла — COMMENT_REQUIRED', async () => {
		const s = await setup()
		const id = await submit(s, 0)
		const teacher = s.t.as('teacher')
		expect(
			await fails(
				teacher.assignment.review({ submissionId: id, decision: 'needs_revision', comment: null, fileIds: [] }),
			),
		).toMatchObject({ code: 'COMMENT_REQUIRED' })
		const file = await upload(teacher, 'правки.pdf', 'application/pdf')
		await teacher.assignment.review({ submissionId: id, decision: 'needs_revision', comment: null, fileIds: [file] })
		const back = await s.student.assignment.get(s.refs[0] as { lessonId: string; blockKey: string })
		expect(back.submission?.status).toBe('needs_revision')
		expect(back.submission?.comments[0]?.files.map((f) => f.name)).toEqual(['правки.pdf'])
	})
})

describe('письмо о результате', () => {
	it('после решения ученику уходит письмо: статус, комментарий, ссылка на урок; автопринятие письма не шлёт', async () => {
		const s = await setup(2)
		const email = s.t.people.student.email
		const id = await submit(s, 0)
		await s.t
			.as('curator')
			.assignment.review({ submissionId: id, decision: 'needs_revision', comment: doc('Добавьте тени и перспективу') })
		const mail = await lastMailTo(email)
		expect(mail.subject).toContain('нужно доработать')
		expect(mail.text).toContain('Добавьте тени и перспективу')
		expect(mail.text).toMatch(
			new RegExp(`/learn/courses/${s.course.id}/lessons/${(s.refs[0] as { lessonId: string }).lessonId}`),
		)
		expect(mail.html).toContain('Открыть урок')

		await s.student.assignment.submit({
			...(s.refs[0] as { lessonId: string; blockKey: string }),
			body: doc('Исправил'),
			fileIds: [],
		})
		await s.t.as('teacher').assignment.review({ submissionId: id, decision: 'accept', comment: null })
		expect((await lastMailTo(email)).subject).toContain('принята')

		// автопринятие (проверка не нужна) — письма нет
		const auto = await setup(1, { requiresReview: false })
		await auto.student.assignment.submit({
			...(auto.refs[0] as { lessonId: string; blockKey: string }),
			body: doc('Сдаю'),
			fileIds: [],
		})
		await drainJobs()
		expect(memoryOutbox.filter((x) => x.to === auto.t.people.student.email)).toHaveLength(0)
	})
})
