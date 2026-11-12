// Данные ученика по запросу (карточка 5.5): выгрузка zip (свои — ученик, любого ученика — администратор), удаление данных
// (обезличивание): файлы и тексты удалены, оценки и прогресс на месте, сертификат аннулирован, человек в другой школе не
// задет; тест-страж — каждая тенантная таблица с ПДн покрыта частью «данных человека».

import { isPii } from '@dinastia/db'
import { questionTypes } from '@dinastia/questions'
import { ORPCError } from '@orpc/client'
import { and, eq, getTableName, is, isNotNull } from 'drizzle-orm'
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core'
import { unzipSync } from 'fflate'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '#/db-schema.ts'
import { auditLog } from '#/kernel/audit/schema.ts'
import { consents, sessions, users } from '#/kernel/auth/schema.ts'
import { db, pool } from '#/kernel/db/client.ts'
import { withTenant } from '#/kernel/db/tenant.ts'
import { members } from '#/kernel/members/schema.ts'
import { allPersonalData } from '#/kernel/registry.ts'
import { files } from '#/kernel/storage/schema.ts'
import { drainJobs, startTestWorker, stopTestWorker } from '#/test/jobs.ts'
import {
	type Client,
	cleanupTestSchools,
	expectPermissionMatrix,
	type TestSchool,
	withTestSchool,
} from '#/test/school.ts'
import { quizAnswers, submissionComments, submissions } from '../assessments/schema.ts'
import { certificates } from '../certificates/schema.ts'
import { enrollmentInvites, enrollments, lessonProgress } from './schema.ts'

beforeAll(startTestWorker)
afterAll(async () => {
	await stopTestWorker()
	await cleanupTestSchools()
	await pool.end()
})

const failure = (e: unknown) => (e instanceof ORPCError ? (e.data as { code?: string }).code : e)
const fails = (p: Promise<unknown>) => p.then(() => 'ok', failure)
const doc = (text: string) => ({
	type: 'doc' as const,
	content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})
const STUDENT = 'Ирина Петрова'

async function upload(c: Client, purpose: string, name: string, text: string) {
	const body = new TextEncoder().encode(text)
	const u = await c.files.createUpload({ purpose, name, mime: 'image/png', size: body.length })
	expect((await fetch(u.uploadUrl, { method: 'PUT', headers: u.headers, body })).ok).toBe(true)
	return (await c.files.complete({ id: u.fileId })).id
}

const memberIdOf = (t: TestSchool, userId: string) =>
	withTenant(t.school.id, async (tx) => {
		const [m] = await tx.select().from(members).where(eq(members.userId, userId))
		return m?.id as string
	})

/**
 * Школа, где ученик прошёл курс с сертификатом и сдал работу с файлом (с перепиской), ответил текстом в тесте; во второй
 * школе он тоже учится. Второй ученик первой школы — для проверки «чужие данные не попадают».
 */
async function setup() {
	const t = await withTestSchool('Школа данных')
	await db.update(users).set({ name: STUDENT }).where(eq(users.id, t.people.student.id))
	const c = t.as('teacher')
	const course = await c.courses.create({ title: 'Курс с работами' })
	const section = await c.courses.sections.create({ courseId: course.id, title: 'Раздел' })

	const read = await c.courses.lessons.create({ sectionId: section.id, title: 'Чтение' })
	const text = await c.courses.blocks.create({ lessonId: read.id, type: 'text' })
	await c.courses.blocks.update({ id: text.id, data: { body: doc('Текст') } })
	await c.courses.lessons.update({ id: read.id, completionRule: 'view' })
	await c.courses.lessons.publish({ id: read.id })

	const work = await c.courses.lessons.create({ sectionId: section.id, title: 'Работа' })
	const assignment = await c.courses.blocks.create({ lessonId: work.id, type: 'assignment' })
	await c.courses.blocks.update({ id: assignment.id, data: { ...assignment.data, prompt: doc('Нарисуйте') } })
	await c.courses.lessons.update({ id: work.id, completionRule: 'all_blocks' })
	await c.courses.lessons.publish({ id: work.id })

	const test = await c.courses.lessons.create({ sectionId: section.id, title: 'Тест' })
	const q = await c.assessments.questions.create({
		courseId: course.id,
		type: 'open_text',
		data: { ...(questionTypes.open_text.example() as Record<string, unknown>), prompt: doc('Опишите работу') },
		tags: [],
	})
	const quiz = await c.courses.blocks.create({ lessonId: test.id, type: 'quiz' })
	await c.courses.blocks.update({ id: quiz.id, data: { ...quiz.data, questions: [{ questionId: q.id }] } })
	await c.courses.lessons.update({ id: test.id, completionRule: 'all_blocks' })
	await c.courses.lessons.publish({ id: test.id })

	await c.courses.update({ id: course.id, defaultAccessMode: 'open' })
	await c.courses.publish({ id: course.id })
	const template = await c.certificates.template.get({ courseId: course.id })
	const { courseId: _, signatureUrl: _s, backgroundUrl: _b, ...fields } = template
	await c.certificates.template.save({ ...fields, courseId: course.id, enabled: true })

	await c.learning.enrollments.enroll({ courseId: course.id, email: t.people.student.email })
	// второй ученик курса: его данные в выгрузку не попадают
	await c.learning.enrollments.enroll({ courseId: course.id, email: t.people.curator.email.replace('@', '+s@') })
	const student = t.as('student')
	const keyOf = async (lessonId: string, id: string) =>
		(await c.courses.blocks.list({ lessonId })).find((b) => b.id === id)?.blockKey as string

	// работа с файлом, комментарий проверяющего, ответ ученика с файлом
	const workRef = { lessonId: work.id, blockKey: await keyOf(work.id, assignment.id) }
	const workFile = await upload(student, 'assessments.submission-file', 'натюрморт.png', 'работа ученика')
	const state = await student.assignment.submit({ ...workRef, body: doc('Мой натюрморт'), fileIds: [workFile] })
	const submissionId = state.submission?.id as string
	await c.review.comment({ submissionId, body: doc('Добавьте тени'), fileIds: [] })
	const replyFile = await upload(student, 'assessments.comment-file', 'эскиз.png', 'эскиз ученика')
	await student.assignment.reply({ ...workRef, body: doc('Вот эскиз'), fileIds: [replyFile] })
	await c.assignment.review({ submissionId, decision: 'accept', comment: null })

	// тест: развёрнутый ответ, проверка вручную
	const quizRef = { lessonId: test.id, blockKey: await keyOf(test.id, quiz.id) }
	const view = await student.quiz.start(quizRef)
	for (const aq of view.questions)
		await student.quiz.answer({ attemptId: view.attempt.id, attemptQuestionId: aq.id, response: { text: 'Пейзаж' } })
	await student.quiz.submit({ attemptId: view.attempt.id })
	const attempt = await c.review.attempt({ attemptId: view.attempt.id })
	await c.review.gradeAttempt({
		attemptId: view.attempt.id,
		grades: attempt.questions
			.filter((x) => x.manual)
			.map((x) => ({ attemptQuestionId: x.id, score: x.points, feedback: null })),
	})

	await student.learn.lessons.open({ lessonId: read.id })
	await drainJobs(30_000)

	// та же почта учится во второй школе
	const second = await withTestSchool('Вторая школа')
	await withTenant(second.school.id, (tx) =>
		tx.insert(members).values({ userId: t.people.student.id, role: 'student' }),
	)
	const memberId = await memberIdOf(t, t.people.student.id)
	return { t, c, course, student, memberId, second, submissionId }
}

async function download(client: Client, input: Record<string, unknown>) {
	const started = await client.exports.start({ key: 'learning.member-data', input })
	await drainJobs(30_000)
	const state = await client.exports.get({ id: started.id })
	expect(state.status).toBe('ready')
	const zip = unzipSync(new Uint8Array(await (await fetch(state.url as string)).arrayBuffer()))
	// biome-ignore lint/suspicious/noExplicitAny: data.json — проверяется по полям ниже
	const data = JSON.parse(new TextDecoder().decode(zip['data.json'])) as Record<string, any>
	return { zip, data }
}

describe('данные ученика', () => {
	it('выгрузка: свои данные — ученик, любого ученика — администратор; чужого — нет', { timeout: 120_000 }, async () => {
		const s = await setup()
		const { zip, data } = await download(s.student, {})
		expect(data.profile).toMatchObject({ name: STUDENT, email: s.t.people.student.email, role: 'student' })
		expect(data.school).toMatchObject({ name: 'Школа данных' })
		expect(data.consents).toEqual(expect.any(Array))
		expect(data.learning.enrollments).toMatchObject([{ course: 'Курс с работами', status: expect.any(String) }])
		expect(data.learning.enrollments[0].lessons).toEqual(
			expect.arrayContaining([expect.objectContaining({ lesson: 'Чтение' })]),
		)
		const work = data.assessments.submissions[0]
		expect(work).toMatchObject({ lesson: 'Работа', status: 'accepted', body: doc('Мой натюрморт') })
		expect(work.comments.map((c: { author: string }) => c.author)).toEqual(['staff', 'student'])
		expect(data.assessments.quizAttempts[0].answers[0]).toMatchObject({ text: 'Пейзаж' })
		expect(data.certificates.certificates).toMatchObject([{ course: 'Курс с работами', name: STUDENT }])

		const names = Object.keys(zip)
		const fileText = (suffix: string) => new TextDecoder().decode(zip[names.find((n) => n.endsWith(suffix)) as string])
		expect(fileText('натюрморт.png')).toBe('работа ученика')
		expect(fileText('эскиз.png')).toBe('эскиз ученика')
		expect(names.some((n) => n.startsWith('files/certificates/') && n.endsWith('.pdf'))).toBe(true)

		// чужие данные — только администратору
		expect(
			await fails(s.student.exports.start({ key: 'learning.member-data', input: { memberId: crypto.randomUUID() } })),
		).toBe('NO_PERMISSION')
		const asAdmin = await download(s.t.as('admin'), { memberId: s.memberId })
		expect(asAdmin.data.profile.email).toBe(s.t.people.student.email)
		// сотрудника через выгрузку учеников не выгрузить
		const teacherMember = await memberIdOf(s.t, s.t.people.teacher.id)
		expect(
			await fails(s.t.as('admin').exports.start({ key: 'learning.member-data', input: { memberId: teacherMember } })),
		).toBe('MEMBER_NOT_FOUND')
		// из другой школы — не найден
		expect(
			await fails(s.second.as('admin').exports.start({ key: 'learning.member-data', input: { memberId: s.memberId } })),
		).toBe('MEMBER_NOT_FOUND')
		const log = await withTenant(s.t.school.id, (tx) =>
			tx.select().from(auditLog).where(eq(auditLog.action, 'learning.student.data-exported')),
		)
		expect(log).toHaveLength(2)
	})

	it('удаление данных: тексты и файлы удалены, оценки и прогресс на месте, сертификат аннулирован', {
		timeout: 120_000,
	}, async () => {
		const s = await setup()
		await expectPermissionMatrix(s.t, (c) => c.students.anonymize({ id: crypto.randomUUID() }), {
			allow: ['owner', 'admin'],
			deny: ['teacher', 'curator', 'student'],
		})
		const before = await withTenant(s.t.school.id, async (tx) => ({
			files: await tx.select({ id: files.id, key: files.key }).from(files).where(eq(files.ownerMemberId, s.memberId)),
			cert: (await tx.select().from(certificates).where(eq(certificates.memberId, s.memberId)))[0],
		}))
		expect(before.files.length).toBeGreaterThanOrEqual(2)
		await s.t.as('admin').exports.start({ key: 'learning.member-data', input: { memberId: s.memberId } })
		await withTenant(s.t.school.id, (tx) =>
			tx.insert(enrollmentInvites).values({
				courseId: s.course.id,
				email: s.t.people.student.email.toLowerCase(),
				tokenHash: `t-${crypto.randomUUID()}`,
				expiresAt: new Date(Date.now() + 86_400_000),
				createdByMemberId: s.memberId,
			}),
		)

		const res = await s.t.as('admin').students.anonymize({ id: s.memberId })
		expect(res).toMatchObject({
			id: s.memberId,
			name: 'Удалённый слушатель',
			email: null,
			status: 'deleted',
			courses: 1,
		})
		expect(await fails(s.t.as('admin').students.anonymize({ id: s.memberId }))).toBe('MEMBER_ALREADY_DELETED')
		await drainJobs(30_000)

		const after = await withTenant(s.t.school.id, async (tx) => ({
			member: (await tx.select().from(members).where(eq(members.id, s.memberId)))[0],
			files: await tx.select({ id: files.id }).from(files).where(eq(files.ownerMemberId, s.memberId)),
			works: await tx.select().from(submissions).where(eq(submissions.id, s.submissionId)),
			comments: await tx
				.select()
				.from(submissionComments)
				.where(eq(submissionComments.submissionId, s.submissionId))
				.orderBy(submissionComments.createdAt),
			answers: await tx.select().from(quizAnswers).where(isNotNull(quizAnswers.textValue)),
			enrollment: (await tx.select().from(enrollments).where(eq(enrollments.memberId, s.memberId)))[0],
			progress: await tx
				.select()
				.from(lessonProgress)
				.innerJoin(enrollments, eq(enrollments.id, lessonProgress.enrollmentId))
				.where(eq(enrollments.memberId, s.memberId)),
			cert: (await tx.select().from(certificates).where(eq(certificates.memberId, s.memberId)))[0],
			invites: await tx.select().from(enrollmentInvites).where(eq(enrollmentInvites.createdByMemberId, s.memberId)),
			ips: await tx
				.select()
				.from(auditLog)
				.where(and(eq(auditLog.actorMemberId, s.memberId), isNotNull(auditLog.ip))),
		}))
		expect(after.member).toMatchObject({ status: 'deleted', avatarFileId: null })
		expect(after.member?.userId).not.toBe(s.t.people.student.id)
		expect(after.files).toEqual([])
		expect(after.works[0]).toMatchObject({ status: 'accepted', body: doc('Удалено') })
		expect(after.comments.map((c) => c.body)).toEqual([doc('Добавьте тени'), doc('Удалено')])
		expect(after.answers.map((a) => a.textValue)).toEqual(['Удалено'])
		expect(after.answers[0]?.score).not.toBeNull()
		expect(after.enrollment?.progressPct).toBeGreaterThan(0)
		expect(after.progress.length).toBeGreaterThan(0)
		expect(after.cert).toMatchObject({ studentName: 'Удалённый слушатель', fileId: null })
		expect(after.cert?.revokedAt).not.toBeNull()
		expect(after.invites).toEqual([])
		expect(after.ips).toEqual([])
		const verify = await s.t.as('guest').certificates.verify({ number: before.cert?.number as string })
		expect(verify).toMatchObject({ status: 'revoked' })

		// имя на экранах школы — «Удалённый слушатель»
		const list = await s.c.learning.enrollments.list({ courseId: s.course.id })
		expect(list.items.map((r) => r.studentName)).toContain('Удалённый слушатель')
		expect(JSON.stringify(list)).not.toContain(STUDENT)

		// человек учится во второй школе — его пользователь и вход на месте, согласия этой школы удалены
		const [user] = await db.select().from(users).where(eq(users.id, s.t.people.student.id))
		expect(user).toMatchObject({ name: STUDENT })
		expect(await s.second.as(s.t.people.student).schools.me()).toMatchObject({ user: { name: STUDENT } })
		expect(
			await db
				.select()
				.from(consents)
				.where(and(eq(consents.userId, s.t.people.student.id), eq(consents.schoolId, s.t.school.id))),
		).toEqual([])
		// в первой школе он больше не участник
		expect(await fails(s.student.schools.me())).toBe('NOT_A_MEMBER')

		// журнал: только id
		const [entry] = await withTenant(s.t.school.id, (tx) =>
			tx.select().from(auditLog).where(eq(auditLog.action, 'learning.student.anonymized')),
		)
		expect(JSON.stringify(entry)).not.toContain(STUDENT)
	})

	it('без других школ пользователь удаляется вместе с сессиями; сотрудника удалить нельзя', {
		timeout: 60_000,
	}, async () => {
		const t = await withTestSchool()
		const id = await memberIdOf(t, t.people.student.id)
		await t.as('admin').students.anonymize({ id })
		expect(await db.select().from(users).where(eq(users.id, t.people.student.id))).toEqual([])
		expect(await db.select().from(sessions).where(eq(sessions.userId, t.people.student.id))).toEqual([])
		const teacher = await memberIdOf(t, t.people.teacher.id)
		expect(await fails(t.as('admin').students.anonymize({ id: teacher }))).toBe('MEMBER_NOT_FOUND')
	})

	it('список учеников школы: только ученики, число курсов, поиск', async () => {
		const t = await withTestSchool()
		await expectPermissionMatrix(t, (c) => c.students.list({}), {
			allow: ['owner', 'admin', 'teacher'],
			deny: ['curator', 'student'],
		})
		const page = await t.as('admin').students.list({})
		expect(page.items).toMatchObject([{ email: t.people.student.email, status: 'active', courses: 0 }])
		expect((await t.as('admin').students.list({ q: 'нет-такого' })).total).toBe(0)
	})
})

describe('тест-страж', () => {
	it('каждая тенантная таблица с pii()-колонкой покрыта частью «данных человека» или ядром', () => {
		const covered = new Set(allPersonalData().flatMap(({ part }) => part.tables.map((x) => getTableName(x))))
		// ядро (`kernel/personal-data`): участник, файлы, журнал; не данные ученика — с причиной
		const KERNEL_OR_NOT_STUDENT: Record<string, string> = {
			files: 'ядро: файлы участника удаляются по owner_member_id',
			audit_log: 'ядро: IP обнуляется audit_forget_ip',
			consents: 'ядро: согласия этой школы удаляются',
			ops_audit: 'журнал консоли: IP оператора, не ученика',
			school_stats: 'почта владельца школы — клиент Dinastia, не ученик; строка уходит со школой',
			invitations: 'приглашения сотрудников; удаляются данные только учеников',
			certificate_templates: 'подписант — сотрудник школы',
		}
		const tenantPii = (Object.values(schema) as unknown[])
			.filter((v): v is PgTable => is(v, PgTable))
			.filter((x) => getTableConfig(x).columns.some((c) => c.name === 'school_id'))
			.filter((x) => getTableConfig(x).columns.some((c) => isPii(c)))
			.map((x) => getTableName(x))
		const missing = tenantPii.filter((n) => !covered.has(n) && !(n in KERNEL_OR_NOT_STUDENT))
		expect(missing).toEqual([])
	})
})
