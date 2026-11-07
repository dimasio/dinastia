// Загруженное видео блока «Видео» (карточка 2.4b): создать загрузку у провайдера и опросить статус обработки.
// Файл клиент шлёт провайдеру сам (tus); сервис пишет в блок provider/videoId/status — клиентские значения не берутся.
import { BLOCK_MEDIA } from '@dinastia/blocks'
import { blockStorage } from '@dinastia/blocks/server'
import type { LessonBlock } from '@dinastia/contracts/courses'
import { and, eq } from 'drizzle-orm'
import { blockData, listBlocks, updateBlock } from '#/kernel/blocks/blocks.ts'
import type { BaseCtx, SchoolCtx } from '#/kernel/context.ts'
import { fail } from '#/kernel/errors.ts'
import { ProviderError } from '#/kernel/video/index.ts'
import { lessonOfBlock, touched } from './blocks.service.ts'

async function videoBlock(ctx: BaseCtx, id: string) {
	const block = await blockData(ctx, id)
	if (block.type !== 'video') return fail.invalid('BLOCK_TYPE_MISMATCH')
	return block.data
}

const blockOf = async (ctx: BaseCtx, lessonId: string, id: string) =>
	(await listBlocks(ctx, lessonId, 'draft')).find((b) => b.id === id) as LessonBlock

/** Начать загрузку: видео у провайдера создано, блок — `upload` + `processing`; клиент шлёт файл на `uploadUrl`. */
export async function startVideoUpload(
	ctx: SchoolCtx,
	input: { id: string; filename: string; mime: string; size: number },
) {
	const lessonId = await lessonOfBlock(ctx, input.id)
	const data = await videoBlock(ctx, input.id)
	if (!(BLOCK_MEDIA.video.mime as readonly string[]).includes(input.mime)) return fail.invalid('FILE_TYPE_NOT_ALLOWED')
	if (input.size > BLOCK_MEDIA.video.maxSize) return fail.invalid('FILE_TOO_LARGE')
	let upload: { videoId: string; uploadUrl: string }
	try {
		upload = await ctx.video.createUpload({ filename: input.filename, size: input.size })
	} catch (e) {
		if (!(e instanceof ProviderError)) throw e
		ctx.log.warn({ provider: e.provider, err: e.message }, 'video upload not created')
		return fail.conflict('VIDEO_PROVIDER_UNAVAILABLE')
	}
	await updateBlock(ctx, input.id, {
		...data,
		source: 'upload',
		provider: ctx.video.key,
		videoId: upload.videoId,
		status: 'processing',
	})
	await touched(ctx, lessonId)
	return { uploadUrl: upload.uploadUrl, block: await blockOf(ctx, lessonId, input.id) }
}

/** Узнать у провайдера статус блока в обработке и записать; провайдер недоступен — блок как есть (повторит задача). */
export async function syncVideoBlock(ctx: BaseCtx, id: string) {
	const data = await videoBlock(ctx, id)
	if (data.source !== 'upload' || data.status !== 'processing' || typeof data.videoId !== 'string') return false
	const status = await ctx.video.getStatus(data.videoId)
	if (status === 'processing') return false
	await updateBlock(ctx, id, { ...data, status })
	return true
}

/** Проверка статуса по просьбе редактора (опрос, пока `processing`); возвращает актуальный блок. */
export async function refreshVideo(ctx: SchoolCtx, id: string) {
	const lessonId = await lessonOfBlock(ctx, id)
	try {
		await syncVideoBlock(ctx, id)
	} catch (e) {
		if (!(e instanceof ProviderError)) throw e
		ctx.log.warn({ provider: e.provider, err: e.message }, 'video status not fetched')
	}
	return blockOf(ctx, lessonId, id)
}

/** Все блоки школы в обработке — для периодической задачи. */
export async function processingVideoBlockIds(ctx: BaseCtx): Promise<string[]> {
	const table = blockStorage('video')?.table as unknown as {
		blockId: never
		source: never
		status: never
	}
	if (!table) return []
	const rows = (await ctx.db
		.select({ id: table.blockId })
		.from(table as never)
		.where(and(eq(table.source, 'upload'), eq(table.status, 'processing')))) as unknown as { id: string }[]
	return rows.map((r) => r.id)
}
