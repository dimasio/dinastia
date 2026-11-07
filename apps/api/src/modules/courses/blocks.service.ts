// Блоки урока в конструкторе (карточка 2.3): тонкая обёртка над механизмом ядра kernel/blocks — проверка урока,
// отметка «есть неопубликованные изменения» (domain.md §3), журнал удаления. Правится только черновик (D-033).

import { blockDef, blockFileIds } from '@dinastia/blocks'
import type { LessonBlock } from '@dinastia/contracts/courses'
import { LESSON_MEDIA_PURPOSE } from '@dinastia/contracts/courses'
import { lessonBlocks } from '@dinastia/db'
import { eq } from 'drizzle-orm'
import { blockData, createBlock, listBlocks, removeBlock, reorderBlocks, updateBlock } from '#/kernel/blocks/blocks.ts'
import type { SchoolCtx } from '#/kernel/context.ts'
import { fail } from '#/kernel/errors.ts'
import { courses, lessons } from './schema.ts'

export async function lessonOrFail(ctx: SchoolCtx, id: string) {
	const [row] = await ctx.db.select().from(lessons).where(eq(lessons.id, id)).limit(1)
	return row ?? fail.notFound('LESSON_NOT_FOUND')
}

/** Урок блока; блока нет (или он чужой школы) — BLOCK_NOT_FOUND. */
export async function lessonOfBlock(ctx: SchoolCtx, blockId: string) {
	const [row] = await ctx.db
		.select({ lessonId: lessonBlocks.lessonId })
		.from(lessonBlocks)
		.where(eq(lessonBlocks.id, blockId))
	return row?.lessonId ?? fail.notFound('BLOCK_NOT_FOUND')
}

export const touched = (ctx: SchoolCtx, lessonId: string) =>
	ctx.db.update(lessons).set({ hasUnpublishedChanges: true }).where(eq(lessons.id, lessonId))

/** Урок с курсом — шапка конструктора урока. */
export async function getLesson(ctx: SchoolCtx, id: string) {
	const lesson = await lessonOrFail(ctx, id)
	const [course] = await ctx.db
		.select({ id: courses.id, title: courses.title, status: courses.status })
		.from(courses)
		.where(eq(courses.id, lesson.courseId))
	if (!course) return fail.notFound('COURSE_NOT_FOUND')
	return {
		id: lesson.id,
		courseId: lesson.courseId,
		sectionId: lesson.sectionId,
		title: lesson.title,
		position: lesson.position,
		accessMode: lesson.accessMode,
		completionRule: lesson.completionRule,
		publishedAt: lesson.publishedAt,
		hasUnpublishedChanges: lesson.hasUnpublishedChanges,
		course,
	}
}

export async function listLessonBlocks(ctx: SchoolCtx, lessonId: string): Promise<LessonBlock[]> {
	await lessonOrFail(ctx, lessonId)
	return listBlocks(ctx, lessonId, 'draft')
}

/** Новый блок из палитры: данные — defaults() типа; без `index` — в конец урока. */
export async function addLessonBlock(
	ctx: SchoolCtx,
	input: { lessonId: string; type: string; index?: number | undefined },
) {
	await lessonOrFail(ctx, input.lessonId)
	const block = await createBlock(ctx, { lessonId: input.lessonId, type: input.type })
	if (input.index !== undefined) {
		const ids = (await listBlocks(ctx, input.lessonId, 'draft')).map((b) => b.id).filter((id) => id !== block.id)
		ids.splice(Math.min(input.index, ids.length), 0, block.id)
		await reorderBlocks(ctx, input.lessonId, ids)
	}
	await touched(ctx, input.lessonId)
	return (await listBlocks(ctx, input.lessonId, 'draft')).find((b) => b.id === block.id) as LessonBlock
}

/**
 * Новые файлы в данных блока (карточка 2.7): готовые, своего назначения (блок «Файл» — `courses.lesson-file`, остальное —
 * картинки `courses.lesson-image`), загружены этим участником. Уже привязанные (их загрузил коллега) — не проверяются.
 */
async function checkNewFiles(ctx: SchoolCtx, blockId: string, data: unknown) {
	const prev = await blockData(ctx, blockId)
	const def = blockDef(prev.type)
	if (!def?.files) return
	const before = new Set(blockFileIds(def, prev.data))
	const purpose = prev.type === 'file' ? LESSON_MEDIA_PURPOSE.file : LESSON_MEDIA_PURPOSE.image
	const parsed = def.schema.safeParse(data)
	if (!parsed.success) return // ошибку схемы вернёт ядро при сохранении
	for (const id of blockFileIds(def, parsed.data).filter((x) => !before.has(x))) {
		const file = await ctx.files.get(id)
		if (file?.status !== 'ready' || file.purpose !== purpose || file.ownerMemberId !== ctx.member.id)
			fail.invalid('FILE_INVALID')
	}
}

/**
 * Загруженное видео (2.4b): сервис, id и статус пишет только сервер (`startVideoUpload`, синхронизация) — что прислал
 * клиент, отбрасывается. Переключение на ссылку — загруженное забывается.
 */
function lockVideoFields(prev: Record<string, unknown>, data: Record<string, unknown>) {
	const keep = data.source === 'upload' && prev.source === 'upload'
	return {
		...data,
		provider: keep ? (prev.provider ?? null) : null,
		videoId: keep ? (prev.videoId ?? null) : null,
		status: keep ? (prev.status ?? null) : null,
	}
}

export async function updateLessonBlock(ctx: SchoolCtx, input: { id: string; data: Record<string, unknown> }) {
	const lessonId = await lessonOfBlock(ctx, input.id)
	await checkNewFiles(ctx, input.id, input.data)
	const prev = await blockData(ctx, input.id)
	const data = prev.type === 'video' ? lockVideoFields(prev.data, input.data) : input.data
	const block = await updateBlock(ctx, input.id, data)
	await touched(ctx, lessonId)
	return block
}

export async function moveLessonBlock(ctx: SchoolCtx, input: { id: string; index: number }) {
	const lessonId = await lessonOfBlock(ctx, input.id)
	const ids = (await listBlocks(ctx, lessonId, 'draft')).map((b) => b.id).filter((id) => id !== input.id)
	ids.splice(Math.min(input.index, ids.length), 0, input.id)
	await reorderBlocks(ctx, lessonId, ids)
	await touched(ctx, lessonId)
	return listBlocks(ctx, lessonId, 'draft')
}

export async function removeLessonBlock(ctx: SchoolCtx, id: string) {
	const lessonId = await lessonOfBlock(ctx, id)
	const [row] = await ctx.db.select({ type: lessonBlocks.type }).from(lessonBlocks).where(eq(lessonBlocks.id, id))
	await removeBlock(ctx, id)
	await touched(ctx, lessonId)
	await ctx.audit('courses.block.removed', { entity: 'lesson-block', id, diff: { lessonId, type: row?.type } })
	return { ok: true as const }
}
