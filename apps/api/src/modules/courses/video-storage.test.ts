// Видео в хранилище школы (VIDEO_PROVIDER=storage, D-070): presigned PUT, подтверждение файла → готово, слушателю —
// подписанная ссылка на файл; клиент не подставит чужой файл; без загрузки — ошибка обработки.
import { ORPCError } from '@orpc/client'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { config } from '#/kernel/config.ts'
import { pool } from '#/kernel/db/client.ts'
import { withTenant } from '#/kernel/db/tenant.ts'
import { log } from '#/kernel/log.ts'
import { members } from '#/kernel/members/schema.ts'
import { files } from '#/kernel/storage/schema.ts'
import { tenantCtx } from '#/kernel/tenant-ctx.ts'
import { cleanupTestSchools, type TestSchool, withTestSchool } from '#/test/school.ts'
import { enrollMember } from '../learning/service.ts'

const before = config.VIDEO_PROVIDER
beforeAll(() => {
	;(config as { VIDEO_PROVIDER: string }).VIDEO_PROVIDER = 'storage'
})
afterAll(async () => {
	;(config as { VIDEO_PROVIDER: string }).VIDEO_PROVIDER = before
	await cleanupTestSchools()
	await pool.end()
})

const code = (e: unknown) => (e instanceof ORPCError ? (e.data as { code?: string })?.code : String(e))
const fails = (p: Promise<unknown>) => p.then(() => 'ok', code)
const body = new TextEncoder().encode('не совсем mp4, но хранилищу всё равно')
const MP4 = { filename: 'урок.mp4', mime: 'video/mp4', size: body.length }

async function setup() {
	const t = await withTestSchool()
	const c = t.as('teacher')
	const course = await c.courses.create({ title: 'Курс с видео' })
	const section = await c.courses.sections.create({ courseId: course.id, title: 'Раздел' })
	const lesson = await c.courses.lessons.create({ sectionId: section.id, title: 'Урок' })
	const block = await c.courses.blocks.create({ lessonId: lesson.id, type: 'video' })
	return { t, c, course, lesson, block }
}

async function enroll(t: TestSchool, courseId: string) {
	return withTenant(t.school.id, async (tx) => {
		const [m] = await tx.select().from(members).where(eq(members.userId, t.people.student.id))
		const ctx = tenantCtx(tx, t.school, { now: () => new Date(), log })
		return enrollMember(ctx, { memberId: (m as { id: string }).id, courseId })
	})
}

describe('видео в хранилище школы', () => {
	it('PUT → подтверждение → готово; слушателю — ссылка на файл, без адреса сервиса', async () => {
		const { t, c, course, lesson, block } = await setup()
		const started = await c.courses.blocks.startVideoUpload({ id: block.id, ...MP4 })
		expect(started.file).toBeDefined()
		expect(started.block.data).toMatchObject({ videoId: started.file?.id, fileId: null })
		expect(started.block.data).toMatchObject({ source: 'upload', provider: 'storage', status: 'processing' })
		expect(started.block.files).toEqual({}) // в обработке ссылки нет
		// не загружено — ещё в обработке, урок не публикуется
		expect((await c.courses.blocks.videoStatus({ id: block.id })).data.status).toBe('processing')
		expect(await fails(c.courses.lessons.publish({ id: lesson.id }))).toBe('LESSON_HAS_ISSUES')

		const file = started.file as { id: string; headers: Record<string, string> }
		expect((await fetch(started.uploadUrl, { method: 'PUT', headers: file.headers, body })).ok).toBe(true)
		await c.files.complete({ id: file.id })
		const ready = await c.courses.blocks.videoStatus({ id: block.id })
		expect(ready.data).toMatchObject({ status: 'ready', fileId: file.id })
		expect(Object.keys(ready.files)).toEqual([file.id])

		await c.courses.lessons.publish({ id: lesson.id })
		await c.courses.publish({ id: course.id })
		await enroll(t, course.id)
		const page = await t.as('student').learn.lessons.get({ lessonId: lesson.id })
		const video = page.blocks.find((b) => b.type === 'video')
		expect(video?.data).toEqual({ fileId: file.id, src: null, caption: null })
		const url = video?.files[file.id]?.url ?? ''
		expect(await (await fetch(url)).text()).toBe(new TextDecoder().decode(body))
	})

	it('клиент не подставит другой файл; переключение на ссылку забывает загруженное', async () => {
		const { c, block } = await setup()
		const started = await c.courses.blocks.startVideoUpload({ id: block.id, ...MP4 })
		const other = await c.files.createUpload({
			purpose: 'courses.lesson-video',
			name: 'другое.mp4',
			mime: MP4.mime,
			size: MP4.size,
		})
		const forged = await c.courses.blocks.update({
			id: block.id,
			data: { ...started.block.data, fileId: other.fileId, status: 'ready' },
		})
		expect(forged.data).toMatchObject({ videoId: started.file?.id, fileId: null, status: 'processing' })
		const back = await c.courses.blocks.update({ id: block.id, data: { ...forged.data, source: 'link', url: '' } })
		expect(back.data).toMatchObject({ source: 'link', fileId: null, videoId: null, status: null })
	})

	it('файл видео пропал (незавершённую загрузку убрала очистка) — ошибка обработки; куратор не загружает', async () => {
		const { t, c, block } = await setup()
		const started = await c.courses.blocks.startVideoUpload({ id: block.id, ...MP4 })
		// как очистка незавершённых загрузок: строки файла больше нет
		await withTenant(t.school.id, (tx) => tx.delete(files).where(eq(files.id, started.file?.id as string)))
		expect((await c.courses.blocks.videoStatus({ id: block.id })).data.status).toBe('failed')
		expect(await fails(t.as('curator').courses.blocks.startVideoUpload({ id: block.id, ...MP4 }))).toBe('NO_PERMISSION')
	})
})
