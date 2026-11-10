// Домашнее задание (скилл lms-assessments, карточка 3.4): состояние сдачи ученика, черновик, отправка, проверка. Доступ ученика
// к уроку — модуль learning; настройки — опубликованный блок `assignment`; статусы — только через `transition`.
import {
	ASSIGNMENT_MAX_FILES,
	type AssignmentState,
	COMMENT_FILES_MAX,
	SUBMISSION_TEXT_MAX,
	type Submission,
} from '@dinastia/contracts/assessments'
import { emptyDoc, isEmptyDoc, toPlainText } from '@dinastia/contracts/common'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { users } from '#/kernel/auth/schema.ts'
import { listBlocks } from '#/kernel/blocks/blocks.ts'
import type { SchoolCtx } from '#/kernel/context.ts'
import { fail } from '#/kernel/errors.ts'
import { members } from '#/kernel/members/schema.ts'
import { files } from '#/kernel/storage/schema.ts'
import { enrollmentScope } from '../learning/policies.ts'
import { openLessonContext, recordBlockResult } from '../learning/service.ts'
import { submissionReviewed, submissionSubmitted } from './events.ts'
import { commentFilePurpose, submissionFilePurpose } from './files.ts'
import { submissionCommentFiles, submissionComments, submissionFiles, submissions } from './schema.ts'
import { isEditable, type SubmissionStatus, transition } from './transitions.ts'

type Row = typeof submissions.$inferSelect
interface Settings {
	prompt: unknown
	allowText: boolean
	allowFiles: boolean
	maxFiles: number
	requiresReview: boolean
}
type DocValue = Submission['body']
type Answer = { body: DocValue; fileIds: string[] }

/** Настройки опубликованного блока урока; нет — QUIZ_NOT_FOUND-подобный ASSIGNMENT_NOT_FOUND. */
export async function blockOf(ctx: SchoolCtx, lessonId: string, blockKey: string) {
	const block = (await listBlocks(ctx, lessonId, 'published')).find(
		(b) => b.blockKey === blockKey && b.type === 'assignment',
	)
	if (!block) return fail.notFound('ASSIGNMENT_NOT_FOUND')
	return { settings: block.data as unknown as Settings, files: block.files }
}

async function findRow(ctx: SchoolCtx, enrollmentId: string, lessonId: string, blockKey: string): Promise<Row | null> {
	const [row] = await ctx.db
		.select()
		.from(submissions)
		.where(
			and(
				eq(submissions.enrollmentId, enrollmentId),
				eq(submissions.lessonId, lessonId),
				eq(submissions.blockKey, blockKey),
			),
		)
	return row ?? null
}

/** Комментарии по времени: автор, роль, текст и файлы со ссылками на скачивание. */
export async function commentsOf(ctx: SchoolCtx, submissionId: string): Promise<Submission['comments']> {
	const rows = await ctx.db
		.select({
			id: submissionComments.id,
			body: submissionComments.body,
			createdAt: submissionComments.createdAt,
			name: users.name,
			role: members.role,
		})
		.from(submissionComments)
		.innerJoin(members, eq(members.id, submissionComments.authorMemberId))
		.innerJoin(users, eq(users.id, members.userId))
		.where(eq(submissionComments.submissionId, submissionId))
		.orderBy(asc(submissionComments.createdAt), asc(submissionComments.id))
	if (!rows.length) return []
	const fileRows = await ctx.db
		.select({
			commentId: submissionCommentFiles.commentId,
			id: files.id,
			name: files.name,
			mime: files.mime,
			size: files.size,
		})
		.from(submissionCommentFiles)
		.innerJoin(files, eq(files.id, submissionCommentFiles.fileId))
		.where(
			inArray(
				submissionCommentFiles.commentId,
				rows.map((r) => r.id),
			),
		)
		.orderBy(asc(submissionCommentFiles.position))
	const urls = new Map<string, string>()
	for (const f of fileRows) urls.set(f.id, await ctx.files.signedUrl(f.id, { download: !f.mime.startsWith('image/') }))
	return rows.map((c) => ({
		id: c.id,
		authorName: c.name,
		authorRole: c.role,
		body: c.body as never,
		files: fileRows
			.filter((f) => f.commentId === c.id)
			.map(({ commentId: _, ...f }) => ({ ...f, url: urls.get(f.id) as string })),
		createdAt: c.createdAt,
	}))
}

/** Файлы комментария: готовые, назначения `assessments.comment-file`, загружены этим участником; не больше лимита. */
export async function checkCommentFiles(ctx: SchoolCtx, fileIds: string[]): Promise<string[]> {
	const ids = [...new Set(fileIds)]
	if (ids.length > COMMENT_FILES_MAX) return fail.invalid('TOO_MANY_FILES')
	for (const id of ids) {
		const file = await ctx.files.get(id)
		if (file?.status !== 'ready' || file.purpose !== commentFilePurpose.key || file.ownerMemberId !== ctx.member.id)
			return fail.invalid('FILE_INVALID')
	}
	return ids
}

/** Комментарий в переписке: текст и/или файлы (пустой — COMMENT_REQUIRED). */
export async function addComment(ctx: SchoolCtx, submissionId: string, input: { body: DocValue; fileIds: string[] }) {
	const body = input.body && !isEmptyDoc(input.body) ? input.body : null
	const ids = await checkCommentFiles(ctx, input.fileIds)
	if (!body && ids.length === 0) return fail.invalid('COMMENT_REQUIRED')
	if (body && toPlainText(body).length > SUBMISSION_TEXT_MAX) return fail.invalid('ANSWER_TOO_LONG')
	const [comment] = await ctx.db
		.insert(submissionComments)
		// файл без текста — комментарий с пустым абзацем
		.values({ submissionId, authorMemberId: ctx.member.id, body: (body ?? emptyDoc()) as never })
		.returning({ id: submissionComments.id })
	if (!comment) throw new Error('комментарий не создан')
	if (ids.length)
		await ctx.db
			.insert(submissionCommentFiles)
			.values(ids.map((fileId, position) => ({ commentId: comment.id, fileId, position })))
	return comment.id
}

export async function viewOf(ctx: SchoolCtx, row: Row): Promise<Submission> {
	const fileRows = await ctx.db
		.select({ id: files.id, name: files.name, mime: files.mime, size: files.size })
		.from(submissionFiles)
		.innerJoin(files, eq(files.id, submissionFiles.fileId))
		.where(eq(submissionFiles.submissionId, row.id))
		.orderBy(asc(submissionFiles.position))
	const comments = await commentsOf(ctx, row.id)
	return {
		id: row.id,
		status: row.status,
		body: (row.body as DocValue) ?? null,
		files: await Promise.all(
			fileRows.map(async (f) => ({
				...f,
				url: await ctx.files.signedUrl(f.id, { download: !f.mime.startsWith('image/') }),
			})),
		),
		comments,
		revision: row.revision,
		submittedAt: row.submittedAt,
		reviewedAt: row.reviewedAt,
	}
}

async function stateOf(ctx: SchoolCtx, ref: { lessonId: string; blockKey: string }): Promise<AssignmentState> {
	const c = await openLessonContext(ctx, ref.lessonId)
	const { settings, files: promptFiles } = await blockOf(ctx, ref.lessonId, ref.blockKey)
	const row = await findRow(ctx, c.enrollment.id, ref.lessonId, ref.blockKey)
	return {
		settings: settings as AssignmentState['settings'],
		promptFiles,
		submission: row ? await viewOf(ctx, row) : null,
		canEdit: !row || isEditable(row.status),
	}
}

export const getAssignment = stateOf

/** Проверка ответа по настройкам блока: что разрешено, лимиты, принадлежность файлов; возвращает нормализованный ответ. */
async function checkAnswer(ctx: SchoolCtx, settings: Settings, answer: Answer): Promise<Answer> {
	const body = answer.body && !isEmptyDoc(answer.body) ? answer.body : null
	if (body && !settings.allowText) return fail.invalid('TEXT_NOT_ALLOWED')
	if (body && toPlainText(body).length > SUBMISSION_TEXT_MAX) return fail.invalid('ANSWER_TOO_LONG')
	const ids = [...new Set(answer.fileIds)]
	if (ids.length && !settings.allowFiles) return fail.invalid('FILES_NOT_ALLOWED')
	if (ids.length > Math.min(settings.maxFiles, ASSIGNMENT_MAX_FILES)) return fail.invalid('TOO_MANY_FILES')
	for (const id of ids) {
		const file = await ctx.files.get(id)
		if (file?.status !== 'ready' || file.purpose !== submissionFilePurpose.key || file.ownerMemberId !== ctx.member.id)
			return fail.invalid('FILE_INVALID')
	}
	return { body, fileIds: ids }
}

/** Записать ответ в сдачу (создать запись при первом сохранении): текст и файлы заменяются присланными. */
async function writeAnswer(
	ctx: SchoolCtx,
	enrollmentId: string,
	ref: { lessonId: string; blockKey: string },
	settings: Settings,
	answer: Answer,
) {
	const checked = await checkAnswer(ctx, settings, answer)
	let row = await findRow(ctx, enrollmentId, ref.lessonId, ref.blockKey)
	if (row && !isEditable(row.status)) return fail.conflict('SUBMISSION_STATE', { from: row.status })
	if (!row) {
		const [created] = await ctx.db
			.insert(submissions)
			.values({ enrollmentId, lessonId: ref.lessonId, blockKey: ref.blockKey })
			.onConflictDoNothing()
			.returning()
		row = created ?? (await findRow(ctx, enrollmentId, ref.lessonId, ref.blockKey))
	}
	if (!row) throw new Error('сдача не создана')
	await ctx.db
		.update(submissions)
		.set({ body: checked.body as never })
		.where(eq(submissions.id, row.id))
	await ctx.db.delete(submissionFiles).where(eq(submissionFiles.submissionId, row.id))
	if (checked.fileIds.length)
		await ctx.db
			.insert(submissionFiles)
			.values(checked.fileIds.map((fileId, position) => ({ submissionId: row.id, fileId, position })))
	return { row, answer: checked }
}

export async function saveDraft(
	ctx: SchoolCtx,
	input: { lessonId: string; blockKey: string } & Answer,
): Promise<AssignmentState> {
	const c = await openLessonContext(ctx, input.lessonId)
	const { settings } = await blockOf(ctx, input.lessonId, input.blockKey)
	await writeAnswer(ctx, c.enrollment.id, input, settings, input)
	return stateOf(ctx, input)
}

export async function submitAssignment(
	ctx: SchoolCtx,
	input: { lessonId: string; blockKey: string } & Answer,
): Promise<AssignmentState> {
	const c = await openLessonContext(ctx, input.lessonId)
	const { settings } = await blockOf(ctx, input.lessonId, input.blockKey)
	const { row, answer } = await writeAnswer(ctx, c.enrollment.id, input, settings, input)
	if (!answer.body && answer.fileIds.length === 0) return fail.invalid('SUBMISSION_EMPTY')
	const now = ctx.now()
	const status = transition(row.status, 'submitted', 'student')
	const ids = {
		submissionId: row.id,
		enrollmentId: c.enrollment.id,
		lessonId: input.lessonId,
		blockKey: input.blockKey,
	}
	await ctx.db
		.update(submissions)
		.set({ status, revision: row.revision + 1, submittedAt: now, reviewedAt: null })
		.where(eq(submissions.id, row.id))
	await ctx.emit(submissionSubmitted, ids)
	if (!settings.requiresReview) {
		// проверка не нужна — принимается сразу (переход «система»)
		await ctx.db
			.update(submissions)
			.set({ status: transition(status, 'accepted', 'system'), reviewedAt: now })
			.where(eq(submissions.id, row.id))
		await ctx.emit(submissionReviewed, { ...ids, status: 'accepted' })
		await recordBlockResult(ctx, {
			enrollmentId: c.enrollment.id,
			lessonId: input.lessonId,
			blockKey: input.blockKey,
			done: true,
		})
	}
	return stateOf(ctx, input)
}

const DECISION_STATUS = { accept: 'accepted', needs_revision: 'needs_revision', reject: 'rejected' } as const

/** Проверка работы преподавателем: принять / вернуть на доработку / отклонить; для двух последних нужен комментарий. */
export async function reviewSubmission(
	ctx: SchoolCtx,
	input: { submissionId: string; decision: keyof typeof DECISION_STATUS; comment: DocValue; fileIds?: string[] },
): Promise<{ id: string; status: SubmissionStatus }> {
	// область проверяющего (4.2): куратор решает только по работам своих потоков, чужая — «не найдено»
	const [row] = await ctx.db
		.select()
		.from(submissions)
		.where(and(eq(submissions.id, input.submissionId), enrollmentScope(ctx, submissions.enrollmentId)))
		.for('update')
	if (!row) return fail.notFound('SUBMISSION_NOT_FOUND')
	const to = DECISION_STATUS[input.decision]
	const comment = input.comment && !isEmptyDoc(input.comment) ? input.comment : null
	const fileIds = input.fileIds ?? []
	// комментарий — текст и/или файлы; при «на доработку» и «отклонить» он обязателен
	if (to !== 'accepted' && !comment && fileIds.length === 0) return fail.invalid('COMMENT_REQUIRED')
	const status = transition(row.status, to, 'reviewer')
	if (comment || fileIds.length) await addComment(ctx, row.id, { body: comment, fileIds })
	await ctx.db
		.update(submissions)
		.set({ status, reviewerMemberId: ctx.member.id, reviewedAt: ctx.now() })
		.where(eq(submissions.id, row.id))
	await ctx.emit(submissionReviewed, {
		submissionId: row.id,
		enrollmentId: row.enrollmentId,
		lessonId: row.lessonId,
		blockKey: row.blockKey,
		status: to,
	})
	await recordBlockResult(ctx, {
		enrollmentId: row.enrollmentId,
		lessonId: row.lessonId,
		blockKey: row.blockKey,
		done: to === 'accepted',
	})
	await ctx.audit('assessments.submission.reviewed', {
		entity: 'submission',
		id: row.id,
		diff: { from: row.status, to },
	})
	return { id: row.id, status }
}

/** Ответ ученика в переписке: пока работа «на проверке» или «нужна доработка»; статус не меняется. */
export async function replyAsStudent(
	ctx: SchoolCtx,
	input: { lessonId: string; blockKey: string; body: DocValue; fileIds: string[] },
): Promise<AssignmentState> {
	const c = await openLessonContext(ctx, input.lessonId)
	await blockOf(ctx, input.lessonId, input.blockKey)
	const row = await findRow(ctx, c.enrollment.id, input.lessonId, input.blockKey)
	if (!row) return fail.notFound('SUBMISSION_NOT_FOUND')
	if (row.status !== 'submitted' && row.status !== 'needs_revision')
		return fail.conflict('SUBMISSION_STATE', { from: row.status })
	await addComment(ctx, row.id, input)
	return stateOf(ctx, input)
}
