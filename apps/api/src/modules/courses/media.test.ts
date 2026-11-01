// Медиа курса (карточка 2.7) на настоящем S3 (SeaweedFS): обложка — загрузка, замена (прежний файл удаляется), убрать;
// блоки «Картинка», «Файл» и картинка в тексте — подписанные ссылки рядом с данными; чужой или не тот файл — FILE_INVALID.
import { ORPCError } from '@orpc/client'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { pool } from '#/kernel/db/client.ts'
import { withTenant } from '#/kernel/db/tenant.ts'
import { files } from '#/kernel/storage/schema.ts'
import { type Client, cleanupTestSchools, type TestSchool, withTestSchool } from '#/test/school.ts'

afterAll(async () => {
	await cleanupTestSchools()
	await pool.end()
})

const code = (e: unknown) => (e instanceof ORPCError ? (e.data as { code?: string })?.code : String(e))
const fails = (p: Promise<unknown>) => p.then(() => 'ok', code)

/** Полная загрузка: createUpload → PUT в S3 → complete. */
async function upload(c: Client, purpose: string, name: string, mime: string, text = 'x') {
	const body = new TextEncoder().encode(text)
	const u = await c.files.createUpload({ purpose, name, mime, size: body.length })
	const put = await fetch(u.uploadUrl, { method: 'PUT', headers: u.headers, body })
	expect(put.ok).toBe(true)
	return (await c.files.complete({ id: u.fileId })).id
}

async function lessonOf(t: TestSchool) {
	const c = t.as('teacher')
	const course = await c.courses.create({ title: 'Курс с медиа' })
	const section = await c.courses.sections.create({ courseId: course.id, title: 'Раздел' })
	const lesson = await c.courses.lessons.create({ sectionId: section.id, title: 'Урок' })
	return { c, course, lesson }
}

describe('обложка курса', () => {
	it('загрузить → ссылка читается; заменить — прежний файл удалён; убрать; чужой файл и аватар — нельзя', async () => {
		const t = await withTestSchool()
		const { c, course } = await lessonOf(t)
		expect(course.coverUrl).toBeNull()
		const first = await upload(c, 'courses.cover', 'обложка.png', 'image/png', 'png-1')
		const withCover = await c.courses.update({ id: course.id, coverFileId: first })
		expect(await (await fetch(withCover.coverUrl ?? '')).text()).toBe('png-1')

		const second = await upload(c, 'courses.cover', 'новая.png', 'image/png', 'png-2')
		await c.courses.update({ id: course.id, coverFileId: second })
		const rows = await withTenant(t.school.id, (tx) =>
			tx.select({ id: files.id }).from(files).where(eq(files.id, first)),
		)
		expect(rows).toEqual([])
		expect((await c.courses.update({ id: course.id, coverFileId: null })).coverUrl).toBeNull()

		const avatar = await upload(c, 'schools.avatar', 'я.png', 'image/png')
		expect(await fails(c.courses.update({ id: course.id, coverFileId: avatar }))).toBe('FILE_INVALID')
		const someone = await upload(t.as('admin'), 'courses.cover', 'чужая.png', 'image/png')
		expect(await fails(c.courses.update({ id: course.id, coverFileId: someone }))).toBe('FILE_INVALID')
		expect(
			await fails(
				t.as('curator').files.createUpload({ purpose: 'courses.cover', name: 'a.png', mime: 'image/png', size: 1 }),
			),
		).toBe('NO_PERMISSION')
	})
})

describe('медиа урока', () => {
	it('картинка, файл и картинка в тексте — ссылки рядом с данными; не тот файл — FILE_INVALID; тип и размер — до загрузки', async () => {
		const t = await withTestSchool()
		const { c, lesson } = await lessonOf(t)
		const img = await upload(c, 'courses.lesson-image', 'схема.png', 'image/png', 'img')
		const pdf = await upload(c, 'courses.lesson-file', 'Конспект.pdf', 'application/pdf', 'pdf')

		const imageBlock = await c.courses.blocks.create({ lessonId: lesson.id, type: 'image' })
		expect(imageBlock.files).toEqual({})
		expect(await fails(c.courses.blocks.update({ id: imageBlock.id, data: { fileId: pdf } }))).toBe('FILE_INVALID')
		const savedImage = await c.courses.blocks.update({ id: imageBlock.id, data: { fileId: img, alt: 'Схема' } })
		expect(await (await fetch(savedImage.files[img]?.url ?? '')).text()).toBe('img')

		const fileBlock = await c.courses.blocks.create({ lessonId: lesson.id, type: 'file' })
		const savedFile = await c.courses.blocks.update({ id: fileBlock.id, data: { fileId: pdf, title: null } })
		const link = savedFile.files[pdf]
		expect(link).toMatchObject({ name: 'Конспект.pdf', mime: 'application/pdf', size: 3 })
		const got = await fetch(link?.url ?? '')
		expect(got.headers.get('content-disposition')).toContain('attachment')

		const textBlock = await c.courses.blocks.create({ lessonId: lesson.id, type: 'text' })
		const body = { type: 'doc', content: [{ type: 'image', attrs: { fileId: img, alt: null } }] }
		expect(Object.keys((await c.courses.blocks.update({ id: textBlock.id, data: { body } })).files)).toEqual([img])

		// коллега правит подпись — уже привязанный чужой файл не мешает
		await t
			.as('admin')
			.courses.blocks.update({ id: imageBlock.id, data: { fileId: img, alt: 'Схема', caption: 'Рис. 1' } })
		const list = await c.courses.blocks.list({ lessonId: lesson.id })
		expect(list.map((b) => Object.keys(b.files))).toEqual([[img], [pdf], [img]])

		await c.courses.lessons.publish({ id: lesson.id })
		expect(
			await fails(
				c.files.createUpload({ purpose: 'courses.lesson-image', name: 'a.svg', mime: 'image/svg+xml', size: 1 }),
			),
		).toBe('FILE_TYPE_NOT_ALLOWED')
		expect(
			await fails(
				c.files.createUpload({
					purpose: 'courses.lesson-file',
					name: 'a.zip',
					mime: 'application/zip',
					size: 101 * 1024 * 1024,
				}),
			),
		).toBe('FILE_TOO_LARGE')
	})

	it('другая школа файл не привяжет', async () => {
		const a = await withTestSchool()
		const b = await withTestSchool()
		const { lesson } = await lessonOf(a)
		const block = await a.as('teacher').courses.blocks.create({ lessonId: lesson.id, type: 'image' })
		const foreign = await upload(b.as('teacher'), 'courses.lesson-image', 'x.png', 'image/png')
		expect(await fails(a.as('teacher').courses.blocks.update({ id: block.id, data: { fileId: foreign } }))).toBe(
			'FILE_INVALID',
		)
	})
})
