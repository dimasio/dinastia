// Загрузка видео в блок «Видео» (карточка 2.4b) на фейковом провайдере: старт, статус обработки, защита полей от
// клиента, публикация только готового, задача-страховка, права.
import { ORPCError } from '@orpc/client'
import { afterAll, describe, expect, it } from 'vitest'
import { pool } from '#/kernel/db/client.ts'
import { withTenant } from '#/kernel/db/tenant.ts'
import { log as logger } from '#/kernel/log.ts'
import { tenantCtx } from '#/kernel/tenant-ctx.ts'
import { FAKE_PROCESSING_MS } from '#/kernel/video/fake.ts'
import { cleanupTestSchools, withTestSchool } from '#/test/school.ts'
import { videoSyncJob } from './jobs.ts'

afterAll(async () => {
	await cleanupTestSchools()
	await pool.end()
})

const code = (e: unknown) => (e instanceof ORPCError ? (e.data as { code?: string })?.code : String(e))
const fails = (p: Promise<unknown>) => p.then(() => 'ok', code)
const MP4 = { filename: 'урок.mp4', mime: 'video/mp4', size: 1000 }

async function setup() {
	const t = await withTestSchool()
	const c = t.as('teacher')
	const course = await c.courses.create({ title: 'Курс с видео' })
	const section = await c.courses.sections.create({ courseId: course.id, title: 'Раздел' })
	const lesson = await c.courses.lessons.create({ sectionId: section.id, title: 'Урок' })
	const block = await c.courses.blocks.create({ lessonId: lesson.id, type: 'video' })
	return { t, c, lesson, block }
}

describe('загрузка видео', () => {
	it('старт → processing; клиент не подделает статус и id; ссылка сбрасывает загруженное', async () => {
		const { c, block } = await setup()
		expect(block.data).toMatchObject({ source: 'link', videoId: null, status: null })

		const started = await c.courses.blocks.startVideoUpload({ id: block.id, ...MP4 })
		expect(started.uploadUrl).toMatch(/^fake:\/\//)
		expect(started.block.data).toMatchObject({ source: 'upload', provider: 'fake', status: 'processing' })
		const videoId = started.block.data.videoId as string

		// автосохранение клиента: подделанные id и статус отбрасываются
		const forged = await c.courses.blocks.update({
			id: block.id,
			data: { ...started.block.data, videoId: 'evil', status: 'ready', caption: 'Подпись' },
		})
		expect(forged.data).toMatchObject({ videoId, status: 'processing', caption: 'Подпись' })
		const back = await c.courses.blocks.update({ id: block.id, data: { ...forged.data, source: 'link', url: '' } })
		expect(back.data).toMatchObject({ source: 'link', videoId: null, status: null, provider: null })
	})

	it('тип и размер проверяются; блок другого типа — отказ; куратор не загружает', async () => {
		const { t, c, lesson, block } = await setup()
		expect(await fails(c.courses.blocks.startVideoUpload({ id: block.id, ...MP4, mime: 'application/pdf' }))).toBe(
			'FILE_TYPE_NOT_ALLOWED',
		)
		expect(await fails(c.courses.blocks.startVideoUpload({ id: block.id, ...MP4, size: 3 * 1024 ** 3 }))).toBe(
			'FILE_TOO_LARGE',
		)
		const heading = await c.courses.blocks.create({ lessonId: lesson.id, type: 'heading' })
		expect(await fails(c.courses.blocks.startVideoUpload({ id: heading.id, ...MP4 }))).toBe('BLOCK_TYPE_MISMATCH')
		expect(await fails(t.as('curator').courses.blocks.startVideoUpload({ id: block.id, ...MP4 }))).toBe('NO_PERMISSION')
	})

	it('пока обрабатывается — урок не публикуется; после обработки — публикуется, ученику уходит адрес плеера', async () => {
		const { t, c, lesson, block } = await setup()
		const started = await c.courses.blocks.startVideoUpload({ id: block.id, ...MP4 })
		expect(await fails(c.courses.lessons.publish({ id: lesson.id }))).toBe('LESSON_HAS_ISSUES')
		// статус сразу после старта — ещё в работе
		expect((await c.courses.blocks.videoStatus({ id: block.id })).data.status).toBe('processing')

		// время идёт: задача-страховка находит блок и узнаёт статус у провайдера
		const later = new Date(Date.now() + FAKE_PROCESSING_MS + 1000)
		await withTenant(t.school.id, async (tx) => {
			const ctx = tenantCtx(
				tx,
				{ id: t.school.id, slug: t.school.slug, name: t.school.name },
				{ now: () => later, log: logger },
			)
			await videoSyncJob.handler(ctx, {})
		})
		const ready = (await c.courses.blocks.list({ lessonId: lesson.id })).find((b) => b.id === block.id)
		expect(ready?.data).toMatchObject({ status: 'ready', videoId: started.block.data.videoId })
		await c.courses.lessons.publish({ id: lesson.id })
	})

	it('имя файла «broken» — обработка закончилась ошибкой, урок не публикуется', async () => {
		const { t, c, lesson, block } = await setup()
		await c.courses.blocks.startVideoUpload({ id: block.id, ...MP4, filename: 'broken.mp4' })
		const later = new Date(Date.now() + FAKE_PROCESSING_MS + 1000)
		await withTenant(t.school.id, async (tx) => {
			const ctx = tenantCtx(
				tx,
				{ id: t.school.id, slug: t.school.slug, name: t.school.name },
				{ now: () => later, log: logger },
			)
			await videoSyncJob.handler(ctx, {})
		})
		const failed = (await c.courses.blocks.list({ lessonId: lesson.id })).find((b) => b.id === block.id)
		expect(failed?.data.status).toBe('failed')
		expect(await fails(c.courses.lessons.publish({ id: lesson.id }))).toBe('LESSON_HAS_ISSUES')
	})
})
