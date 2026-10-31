// Файлы (пункт 1.7): загрузка в S3 (SeaweedFS) по presigned URL, подтверждение, подписанное чтение, изоляция школ,
// замена аватара, очистка незавершённых загрузок.
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { drainJobs, startTestWorker, stopTestWorker } from '#/test/jobs.ts'
import { type Client, cleanupTestSchools, type TestSchool, withTestSchool } from '#/test/school.ts'
import { pool } from '../db/client.ts'
import { withTenant } from '../db/tenant.ts'
import { runJob } from '../worker-runtime.ts'
import { cleanupPendingJob } from './files.ts'
import { headObject } from './s3.ts'
import { files } from './schema.ts'

// PNG 1×1 — настоящий файл для PUT
const png = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
	'base64',
)

async function errorCode(p: Promise<unknown>) {
	try {
		await p
	} catch (e) {
		return (e as { data?: { code?: string } }).data?.code ?? (e as Error).message
	}
	throw new Error('ожидалась ошибка')
}

/** Полная загрузка: createUpload → PUT в S3 → complete. */
async function upload(c: Client, body: Buffer = png, mime = 'image/png') {
	const u = await c.files.createUpload({ purpose: 'schools.avatar', name: 'я.png', mime, size: body.length })
	const put = await fetch(u.uploadUrl, { method: 'PUT', headers: u.headers, body: new Uint8Array(body) })
	expect(put.status).toBe(200)
	return c.files.complete({ id: u.fileId })
}

let a: TestSchool
let b: TestSchool
beforeAll(async () => {
	;[a, b] = await Promise.all([withTestSchool('Школа А'), withTestSchool('Школа Б')])
	await startTestWorker()
})
afterAll(async () => {
	await stopTestWorker()
	await cleanupTestSchools()
	await pool.end()
})

describe('загрузка', () => {
	it('аватар: загрузить, поставить, прочитать по подписанной ссылке; без подписи — нельзя', async () => {
		const file = await upload(a.as('teacher'))
		expect(file).toMatchObject({ name: 'я.png', mime: 'image/png', size: png.length })

		const me = await a.as('teacher').schools.updateMyAvatar({ fileId: file.id })
		const url = me.member.avatarUrl ?? ''
		const got = await fetch(url)
		expect(got.status).toBe(200)
		expect(Buffer.from(await got.arrayBuffer())).toEqual(png)
		expect((await fetch(url.split('?')[0] ?? '')).status).toBe(403)

		// аватар виден в списке сотрудников
		const staff = await a.as('admin').members.list({ q: a.people.teacher.email })
		expect(staff.items[0]?.avatarUrl).toMatch(/^http/)
	})

	it('лимиты назначения проверяются до выдачи ссылки', async () => {
		const c = a.as('curator')
		const base = { purpose: 'schools.avatar', name: 'x', mime: 'image/png', size: 10 }
		expect(await errorCode(c.files.createUpload({ ...base, mime: 'application/pdf' }))).toBe('FILE_TYPE_NOT_ALLOWED')
		expect(await errorCode(c.files.createUpload({ ...base, size: 3 * 1024 * 1024 }))).toBe('FILE_TOO_LARGE')
		expect(await errorCode(c.files.createUpload({ ...base, purpose: 'schools.unknown' }))).toBe('FILE_PURPOSE_UNKNOWN')
	})

	it('S3 не примет файл другого размера; подтвердить до загрузки нельзя', async () => {
		const c = a.as('curator')
		const u = await c.files.createUpload({ purpose: 'schools.avatar', name: 'x.png', mime: 'image/png', size: 10 })
		expect(await errorCode(c.files.complete({ id: u.fileId }))).toBe('FILE_NOT_UPLOADED')
		const put = await fetch(u.uploadUrl, { method: 'PUT', headers: u.headers, body: new Uint8Array(png) }) // объявлено 10 байт
		expect(put.ok).toBe(false)
	})
})

describe('изоляция', () => {
	it('файл школы А не подтвердить и не поставить аватаром в школе Б; чужой файл — не поставить себе', async () => {
		const file = await upload(a.as('teacher'))
		expect(await errorCode(b.as('owner').files.complete({ id: file.id }))).toBe('FILE_NOT_FOUND')
		expect(await errorCode(b.as('owner').schools.updateMyAvatar({ fileId: file.id }))).toBe('FILE_INVALID')
		expect(await errorCode(a.as('curator').schools.updateMyAvatar({ fileId: file.id }))).toBe('FILE_INVALID')
		expect(await errorCode(a.as('curator').files.complete({ id: file.id }))).toBe('FILE_NOT_FOUND')
	})
})

describe('удаление', () => {
	it('новый аватар — прежний файл удаляется (строка сразу, объект — задачей)', async () => {
		const c = a.as('admin')
		const first = await upload(c)
		await c.schools.updateMyAvatar({ fileId: first.id })
		const [row] = await withTenant(a.school.id, (tx) => tx.select().from(files).where(eq(files.id, first.id)))
		const second = await upload(c)
		await c.schools.updateMyAvatar({ fileId: second.id })
		await drainJobs()

		expect(await withTenant(a.school.id, (tx) => tx.select().from(files).where(eq(files.id, first.id)))).toEqual([])
		expect(await headObject(row?.key ?? '')).toBeNull()
		const me = await c.schools.updateMyAvatar({ fileId: null })
		expect(me.member.avatarUrl).toBeNull()
	})

	it('незавершённые загрузки старше суток удаляет задача', async () => {
		const u = await a
			.as('student')
			.files.createUpload({ purpose: 'schools.avatar', name: 'x.png', mime: 'image/png', size: 5 })
		await runJob(
			cleanupPendingJob,
			{ data: {} },
			{ jobId: 'test', now: () => new Date(Date.now() + 25 * 60 * 60 * 1000) },
		)
		expect(await withTenant(a.school.id, (tx) => tx.select().from(files).where(eq(files.id, u.fileId)))).toEqual([])
	})
})
