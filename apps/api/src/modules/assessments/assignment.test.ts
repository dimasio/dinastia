// Домашнее задание (карточка 3.4): блок и публикация, черновик с файлами, отправка, проверка и доработка, конечные статусы,
// автопринятие без проверки, права, изоляция школ, закрытый урок.
import { ORPCError } from '@orpc/client'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { pool } from '#/kernel/db/client.ts'
import { withTenant } from '#/kernel/db/tenant.ts'
import { log } from '#/kernel/log.ts'
import { members } from '#/kernel/members/schema.ts'
import { tenantCtx } from '#/kernel/tenant-ctx.ts'
import { type Client, cleanupTestSchools, withTestSchool } from '#/test/school.ts'
import { lessons } from '../courses/schema.ts'
import { enrollMember } from '../learning/service.ts'

afterAll(async () => {
	await cleanupTestSchools()
	await pool.end()
})

const failure = (e: unknown) => (e instanceof ORPCError ? (e.data as { code?: string; [k: string]: unknown }) : e)
const fails = (p: Promise<unknown>) => p.then(() => 'ok', failure)
const doc = (text: string) => ({
	type: 'doc' as const,
	content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})
const PURPOSE = 'assessments.submission-file'

async function setup(settings: Record<string, unknown> = {}) {
	const t = await withTestSchool()
	const c = t.as('teacher')
	const course = await c.courses.create({ title: 'Курс с заданием' })
	const section = await c.courses.sections.create({ courseId: course.id, title: 'Раздел' })
	const lesson = await c.courses.lessons.create({ sectionId: section.id, title: 'Урок' })
	const block = await c.courses.blocks.create({ lessonId: lesson.id, type: 'assignment' })
	await c.courses.blocks.update({
		id: block.id,
		data: { ...block.data, prompt: doc('Нарисуйте натюрморт'), ...settings },
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
	const blockKey = (await c.courses.blocks.list({ lessonId: lesson.id })).find((b) => b.id === block.id)
		?.blockKey as string
	return { t, c, course, lesson, block, student: t.as('student'), ref: { lessonId: lesson.id, blockKey } }
}

/** Полная загрузка файла: createUpload → PUT → complete. */
async function upload(c: Client, name = 'работа.png', mime = 'image/png', purpose = PURPOSE) {
	const body = new TextEncoder().encode('данные')
	const u = await c.files.createUpload({ purpose, name, mime, size: body.length })
	expect((await fetch(u.uploadUrl, { method: 'PUT', headers: u.headers, body })).ok).toBe(true)
	return (await c.files.complete({ id: u.fileId })).id
}

describe('блок «Задание»', () => {
	it('по умолчанию принимает текст и файлы, до 3, проверка нужна; замечания блокируют публикацию', async () => {
		const t = await withTestSchool()
		const c = t.as('teacher')
		const course = await c.courses.create({ title: 'Курс' })
		const section = await c.courses.sections.create({ courseId: course.id, title: 'Раздел' })
		const lesson = await c.courses.lessons.create({ sectionId: section.id, title: 'Урок' })
		const block = await c.courses.blocks.create({ lessonId: lesson.id, type: 'assignment' })
		expect(block.data).toMatchObject({ allowText: true, allowFiles: true, maxFiles: 3, requiresReview: true })
		expect(await fails(c.courses.lessons.publish({ id: lesson.id }))).toMatchObject({
			code: 'LESSON_HAS_ISSUES',
			blocks: [{ type: 'assignment', issues: ['noPrompt'] }],
		})
		await c.courses.blocks.update({
			id: block.id,
			data: { ...block.data, prompt: doc('Задание'), allowText: false, allowFiles: false },
		})
		expect(await fails(c.courses.lessons.publish({ id: lesson.id }))).toMatchObject({
			blocks: [{ issues: ['noAnswer'] }],
		})
		await c.courses.blocks
			.update({ id: block.id, data: { ...block.data, prompt: doc('Задание'), allowFiles: true, maxFiles: 11 } })
			.catch((e) => expect(e).toMatchObject({ status: 400 }))
		await c.courses.blocks.update({ id: block.id, data: { ...block.data, prompt: doc('Задание') } })
		await c.courses.lessons.publish({ id: lesson.id })
	})
})

describe('черновик', () => {
	it('состояние до начала; сохранение текста и файлов; повторное сохранение заменяет; файл сдачи — со ссылкой', async () => {
		const s = await setup()
		const state = await s.student.assignment.get(s.ref)
		expect(state).toMatchObject({
			submission: null,
			canEdit: true,
			settings: { allowText: true, maxFiles: 3, requiresReview: true },
		})
		const f1 = await upload(s.student, 'эскиз.png')
		const f2 = await upload(s.student, 'отчёт.pdf', 'application/pdf')
		const saved = await s.student.assignment.saveDraft({ ...s.ref, body: doc('Мой натюрморт'), fileIds: [f1, f2] })
		expect(saved.submission).toMatchObject({ status: 'draft', revision: 0, comments: [] })
		expect(saved.submission?.files.map((f) => f.name)).toEqual(['эскиз.png', 'отчёт.pdf'])
		expect(await (await fetch(saved.submission?.files[0]?.url ?? '')).text()).toBe('данные')
		const again = await s.student.assignment.saveDraft({ ...s.ref, body: null, fileIds: [f2] })
		expect(again.submission).toMatchObject({ body: null })
		expect(again.submission?.files.map((f) => f.name)).toEqual(['отчёт.pdf'])
		expect((await s.student.assignment.get(s.ref)).submission?.id).toBe(saved.submission?.id) // одна запись
	})

	it('настройки блока: текст и файлы только если разрешены; число файлов; чужой, неготовый и не тот файл — FILE_INVALID', async () => {
		const noText = await setup({ allowText: false, maxFiles: 1 })
		expect(
			await fails(noText.student.assignment.saveDraft({ ...noText.ref, body: doc('Текст'), fileIds: [] })),
		).toMatchObject({ code: 'TEXT_NOT_ALLOWED' })
		const a = await upload(noText.student)
		const b = await upload(noText.student, 'второй.png')
		expect(
			await fails(noText.student.assignment.saveDraft({ ...noText.ref, body: null, fileIds: [a, b] })),
		).toMatchObject({ code: 'TOO_MANY_FILES' })
		await noText.student.assignment.saveDraft({ ...noText.ref, body: null, fileIds: [a] })

		const noFiles = await setup({ allowFiles: false })
		const f = await upload(noFiles.student)
		expect(
			await fails(noFiles.student.assignment.saveDraft({ ...noFiles.ref, body: doc('Ответ'), fileIds: [f] })),
		).toMatchObject({ code: 'FILES_NOT_ALLOWED' })

		const s = await setup()
		const teacherFile = await upload(s.t.as('teacher'), 'чужой.png', 'image/png', 'courses.lesson-image')
		const avatar = await upload(s.student, 'я.png', 'image/png', 'schools.avatar')
		const pending = await s.student.files.createUpload({
			purpose: PURPOSE,
			name: 'не загружен.png',
			mime: 'image/png',
			size: 5,
		})
		for (const id of [teacherFile, avatar, pending.fileId])
			expect(await fails(s.student.assignment.saveDraft({ ...s.ref, body: null, fileIds: [id] }))).toMatchObject({
				code: 'FILE_INVALID',
			})
		// файл другого ученика того же назначения
		const other = await withTestSchool()
		const strangerFile = await upload(other.as('student'))
		expect(
			await fails(s.student.assignment.saveDraft({ ...s.ref, body: null, fileIds: [strangerFile] })),
		).toMatchObject({ code: 'FILE_INVALID' })
	})
})

describe('отправка и проверка', () => {
	it('пустую отправить нельзя; отправка → «на проверке», revision 1; после отправки править нельзя', async () => {
		const s = await setup()
		expect(await fails(s.student.assignment.submit({ ...s.ref, body: null, fileIds: [] }))).toMatchObject({
			code: 'SUBMISSION_EMPTY',
		})
		const sent = await s.student.assignment.submit({ ...s.ref, body: doc('Готово'), fileIds: [] })
		expect(sent.submission).toMatchObject({ status: 'submitted', revision: 1 })
		expect(sent.submission?.submittedAt).not.toBeNull()
		expect(sent.canEdit).toBe(false)
		expect(await fails(s.student.assignment.saveDraft({ ...s.ref, body: doc('Правка'), fileIds: [] }))).toMatchObject({
			code: 'SUBMISSION_STATE',
		})
		expect(await fails(s.student.assignment.submit({ ...s.ref, body: doc('Ещё раз'), fileIds: [] }))).toMatchObject({
			code: 'SUBMISSION_STATE',
		})
	})

	it('доработка: комментарий обязателен; ученик видит его и пересдаёт (revision 2); принято — конечный статус', async () => {
		const s = await setup()
		const sent = await s.student.assignment.submit({ ...s.ref, body: doc('Первая версия'), fileIds: [] })
		const id = sent.submission?.id as string
		const teacher = s.t.as('teacher')
		expect(
			await fails(teacher.assignment.review({ submissionId: id, decision: 'needs_revision', comment: null })),
		).toMatchObject({ code: 'COMMENT_REQUIRED' })
		expect(
			await teacher.assignment.review({ submissionId: id, decision: 'needs_revision', comment: doc('Добавьте тени') }),
		).toEqual({ id, status: 'needs_revision' })

		const back = await s.student.assignment.get(s.ref)
		expect(back).toMatchObject({ canEdit: true, submission: { status: 'needs_revision', revision: 1 } })
		expect(back.submission?.comments).toMatchObject([{ authorName: expect.any(String) }])
		expect(JSON.stringify(back.submission?.comments)).toContain('Добавьте тени')

		const again = await s.student.assignment.submit({ ...s.ref, body: doc('Вторая версия'), fileIds: [] })
		expect(again.submission).toMatchObject({ status: 'submitted', revision: 2 })
		expect(await teacher.assignment.review({ submissionId: id, decision: 'accept', comment: null })).toEqual({
			id,
			status: 'accepted',
		})
		const done = await s.student.assignment.get(s.ref)
		expect(done).toMatchObject({ canEdit: false, submission: { status: 'accepted', revision: 2 } })
		// конечный статус: ни решение, ни правка, ни отправка
		expect(
			await fails(
				teacher.assignment.review({ submissionId: id, decision: 'needs_revision', comment: doc('Передумал') }),
			),
		).toMatchObject({ code: 'SUBMISSION_STATE' })
		expect(await fails(s.student.assignment.submit({ ...s.ref, body: doc('Ещё'), fileIds: [] }))).toMatchObject({
			code: 'SUBMISSION_STATE',
		})
	})

	it('отклонить: комментарий обязателен; отклонённую пересдать нельзя; решение по неотправленной — SUBMISSION_STATE', async () => {
		const s = await setup()
		const teacher = s.t.as('teacher')
		const draft = await s.student.assignment.saveDraft({ ...s.ref, body: doc('Черновик'), fileIds: [] })
		const id = draft.submission?.id as string
		expect(
			await fails(teacher.assignment.review({ submissionId: id, decision: 'accept', comment: null })),
		).toMatchObject({ code: 'SUBMISSION_STATE' }) // не отправлена
		await s.student.assignment.submit({ ...s.ref, body: doc('Работа'), fileIds: [] })
		expect(
			await fails(teacher.assignment.review({ submissionId: id, decision: 'reject', comment: null })),
		).toMatchObject({ code: 'COMMENT_REQUIRED' })
		expect(
			await teacher.assignment.review({ submissionId: id, decision: 'reject', comment: doc('Это не по теме') }),
		).toEqual({ id, status: 'rejected' })
		expect((await s.student.assignment.get(s.ref)).submission).toMatchObject({ status: 'rejected' })
		expect(await fails(s.student.assignment.submit({ ...s.ref, body: doc('Пересдаю'), fileIds: [] }))).toMatchObject({
			code: 'SUBMISSION_STATE',
		})
	})

	it('без проверки (requires_review = false): при отправке сразу «принято»', async () => {
		const s = await setup({ requiresReview: false })
		const sent = await s.student.assignment.submit({ ...s.ref, body: doc('Сдаю'), fileIds: [] })
		expect(sent.submission).toMatchObject({ status: 'accepted', revision: 1 })
		expect(sent.submission?.reviewedAt).not.toBeNull()
		expect(sent.canEdit).toBe(false)
	})
})

describe('доступ', () => {
	it('права: ученик не проверяет, преподаватель не сдаёт; куратор проверяет (с 3.5)', async () => {
		const s = await setup()
		const sent = await s.student.assignment.submit({ ...s.ref, body: doc('Работа'), fileIds: [] })
		const id = sent.submission?.id as string
		expect(
			await fails(s.student.assignment.review({ submissionId: id, decision: 'accept', comment: null })),
		).toMatchObject({ code: 'NO_PERMISSION' })
		expect(await fails(s.t.as('teacher').assignment.get(s.ref))).toMatchObject({ code: 'NO_PERMISSION' })
		expect(await fails(s.t.as('teacher').assignment.submit({ ...s.ref, body: doc('x'), fileIds: [] }))).toMatchObject({
			code: 'NO_PERMISSION',
		})
		// администратор проверяет
		expect(
			(await s.t.as('admin').assignment.review({ submissionId: id, decision: 'accept', comment: null })).status,
		).toBe('accepted')
	})

	it('другая школа: сдачи не видно, проверить нельзя; не зачисленный ученик — LESSON_NOT_FOUND; неизвестный блок', async () => {
		const s = await setup()
		const sent = await s.student.assignment.submit({ ...s.ref, body: doc('Работа'), fileIds: [] })
		const other = await withTestSchool()
		expect(
			await fails(
				other
					.as('teacher')
					.assignment.review({ submissionId: sent.submission?.id as string, decision: 'accept', comment: null }),
			),
		).toMatchObject({ code: 'SUBMISSION_NOT_FOUND' })
		expect(await fails(other.as('student').assignment.get(s.ref))).toMatchObject({ code: 'LESSON_NOT_FOUND' })
		expect(
			await fails(s.student.assignment.get({ lessonId: s.lesson.id, blockKey: crypto.randomUUID() })),
		).toMatchObject({ code: 'ASSIGNMENT_NOT_FOUND' })
	})

	it('закрытый урок («последовательно») — LESSON_LOCKED', async () => {
		const s = await setup()
		const sec = (await s.c.courses.get({ id: s.course.id })).sections[0]
		const first = await s.c.courses.lessons.create({ sectionId: sec?.id as string, title: 'Первый' })
		await s.c.courses.lessons.move({ id: first.id, sectionId: sec?.id as string, index: 0 })
		await s.c.courses.blocks.create({ lessonId: first.id, type: 'divider' })
		await s.c.courses.lessons.publish({ id: first.id })
		await withTenant(s.t.school.id, (tx) =>
			tx.update(lessons).set({ accessMode: 'sequential' }).where(eq(lessons.id, s.lesson.id)),
		)
		expect(await fails(s.student.assignment.get(s.ref))).toMatchObject({ code: 'LESSON_LOCKED' })
	})
})
