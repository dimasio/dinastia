// Оформление школы (5.9): публичная раздача темы по адресу школы — CSS с ETag, логотип редиректом, тема Dinastia на корне.
import { schools } from '@dinastia/db'
import { ORPCError } from '@orpc/client'
import { eq, inArray } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { createApp } from '#/app.ts'
import { auditLog } from '#/kernel/audit/schema.ts'
import { magicLinkEmail } from '#/kernel/auth/magic-link-email.tsx'
import { config } from '#/kernel/config.ts'
import { db, pool } from '#/kernel/db/client.ts'
import { withTenant } from '#/kernel/db/tenant.ts'
import { deliverEmail } from '#/kernel/mail/send.ts'
import { memoryOutbox } from '#/kernel/mail/transport.ts'
import { files } from '#/kernel/storage/schema.ts'
import { cleanupTestSchools, expectPermissionMatrix, withTestSchool } from '#/test/school.ts'
import { createUser, uniqueSlug } from '#/test/users.ts'
import { schoolBranding } from './schema.ts'
import { createSchool } from './service.ts'

const created: string[] = []
afterAll(async () => {
	await cleanupTestSchools()
	if (created.length) await db.delete(schools).where(inArray(schools.id, created))
	await pool.end()
})

async function newSchool() {
	const owner = await createUser('owner', 'Владелец')
	const { school } = await createSchool({ name: 'Школа', slug: uniqueSlug() }, { userId: owner.id, ip: null })
	created.push(school.id)
	return school
}

const get = (path: string, host: string, headers: Record<string, string> = {}) =>
	createApp().request(path, { headers: { host, ...headers } })

describe('оформление школы: публичная тема', () => {
	it('без оформления и на корне — тема Dinastia; школа — свои токены, повтор — 304', async () => {
		const school = await newSchool()
		const host = `${school.slug}.${config.APP_DOMAIN}`

		const root = await get('/api/branding.css', config.APP_DOMAIN)
		expect(root.status).toBe(200)
		expect(await root.text()).not.toContain('--primary')

		const plain = await get('/api/branding.css', host)
		expect(plain.headers.get('content-type')).toContain('text/css')
		expect(await plain.text()).toBe(':root:root{--default-scheme:system;}\n:root.dark{}\n')

		await withTenant(school.id, (tx) =>
			tx.insert(schoolBranding).values({ primaryColor: '#1d4ed8', font: 'pt-serif', defaultScheme: 'dark' }),
		)
		const branded = await get('/api/branding.css', host)
		const css = await branded.text()
		expect(css).toContain('--default-scheme:dark;')
		expect(css).toContain('--primary:#1d4ed8;')
		expect(css).toContain("--font-sans:'PT Serif'")
		const etag = branded.headers.get('etag') as string
		expect(etag).toContain(school.id)

		expect((await get('/api/branding.css', host, { 'if-none-match': etag })).status).toBe(304)
		await withTenant(school.id, (tx) => tx.update(schoolBranding).set({ version: 2 }))
		expect((await get('/api/branding.css', host, { 'if-none-match': etag })).status).toBe(200)
	})

	it('логотип — редирект на подписанную ссылку; нет логотипа и фавикона — 404', async () => {
		const school = await newSchool()
		const host = `${school.slug}.${config.APP_DOMAIN}`
		expect((await get('/api/branding/logo', host)).status).toBe(404)

		await withTenant(school.id, async (tx) => {
			const [file] = await tx
				.insert(files)
				.values({
					purpose: 'schools.logo',
					name: 'logo.png',
					key: `schools/${school.id}/schools.logo/x`,
					mime: 'image/png',
					size: 10,
					status: 'ready',
				})
				.returning()
			await tx.insert(schoolBranding).values({ logoFileId: file?.id })
		})
		const logo = await get('/api/branding/logo', host)
		expect(logo.status).toBe(302)
		expect(logo.headers.get('location')).toContain(`schools/${school.id}/schools.logo/x`)
		expect((await get('/api/branding/favicon', host)).status).toBe(404)
	})
})

async function readyFile(schoolId: string, purpose: string) {
	return withTenant(schoolId, async (tx) => {
		const id = crypto.randomUUID()
		await tx.insert(files).values({
			id,
			purpose,
			name: 'f.png',
			key: `schools/${schoolId}/${purpose}/${id}`,
			mime: 'image/png',
			size: 10,
			status: 'ready',
		})
		return id
	})
}

const errorOf = (p: Promise<unknown>) =>
	p.then(
		() => null,
		(e: unknown) => (e instanceof ORPCError ? (e.data as { code?: string; suggestion?: string }) : e),
	)

describe('оформление школы: экран', () => {
	it('права: менять и смотреть — владелец и администратор', async () => {
		const t = await withTestSchool()
		await expectPermissionMatrix(t, (c) => c.schools.branding.get(), {
			allow: ['owner', 'admin'],
			deny: ['teacher', 'curator', 'student'],
		})
	})

	it('тема сохраняется, версия растёт, CSS меняется; слабый контраст — отказ с подсказкой', async () => {
		const t = await withTestSchool()
		const admin = t.as('admin')
		const theme = {
			primaryColor: '#0f766e',
			accentColor: '#f59e0b',
			font: 'montserrat',
			radius: 'large',
			defaultScheme: 'light',
		} as const
		expect((await admin.schools.branding.update({ theme })).theme).toEqual(theme)
		const css = await (await get('/api/branding.css', `${t.school.slug}.${config.APP_DOMAIN}`)).text()
		expect(css).toContain('--primary:#0f766e;')

		const weak = await errorOf(admin.schools.branding.update({ theme: { ...theme, primaryColor: '#ffd400' } }))
		expect(weak).toMatchObject({ code: 'BRANDING_LOW_CONTRAST' })
		expect((weak as { suggestion: string }).suggestion).toMatch(/^#[0-9a-f]{6}$/)
		expect((await admin.schools.branding.get()).theme.primaryColor).toBe('#0f766e')

		const [row] = await withTenant(t.school.id, (tx) => tx.select().from(schoolBranding))
		expect(row?.version).toBe(1)
		await admin.schools.branding.update({ theme: { ...theme, radius: 'none' } })
		const [next] = await withTenant(t.school.id, (tx) => tx.select().from(schoolBranding))
		expect(next?.version).toBe(2)

		const audit = await withTenant(t.school.id, (tx) =>
			tx.select().from(auditLog).where(eq(auditLog.action, 'schools.branding.updated')),
		)
		expect(audit).toHaveLength(2)
	})

	it('логотип и фавикон: только своего назначения; замена удаляет прежний файл; логотип — в «кто я»', async () => {
		const t = await withTestSchool()
		const owner = t.as('owner')
		const avatar = await readyFile(t.school.id, 'schools.avatar')
		expect(await errorOf(owner.schools.branding.update({ logoFileId: avatar }))).toMatchObject({ code: 'FILE_INVALID' })

		const first = await readyFile(t.school.id, 'schools.logo')
		const view = await owner.schools.branding.update({ logoFileId: first })
		expect(view.logoUrl).toContain(first)
		expect((await owner.schools.me()).school.logoUrl).toMatch(/^\/api\/branding\/logo\?v=\d+$/)

		const second = await readyFile(t.school.id, 'schools.logo')
		await owner.schools.branding.update({ logoFileId: second })
		const left = await withTenant(t.school.id, (tx) =>
			tx.select({ id: files.id }).from(files).where(eq(files.id, first)),
		)
		expect(left).toEqual([])

		const favicon = await readyFile(t.school.id, 'schools.favicon')
		expect((await owner.schools.branding.update({ faviconFileId: favicon })).faviconUrl).toContain(favicon)
		expect((await owner.schools.branding.update({ logoFileId: null })).logoUrl).toBeNull()
		expect((await owner.schools.me()).school.logoUrl).toBeNull()
	})
})

describe('оформление школы: письма', () => {
	it('логотип ссылкой на сайт школы и кнопка цветом школы; у платформы — как было', async () => {
		const t = await withTestSchool()
		const logo = await readyFile(t.school.id, 'schools.logo')
		await t.as('owner').schools.branding.update({
			logoFileId: logo,
			theme: { primaryColor: '#0f766e', accentColor: null, font: 'system', radius: 'medium', defaultScheme: 'system' },
		})
		const to = `brand-${Date.now()}@test.local`
		await deliverEmail(t.school, magicLinkEmail, { to, data: { url: 'http://example.test/x' } })
		const mail = memoryOutbox.findLast((m) => m.to === to)
		expect(mail?.html).toContain(`${t.school.slug}.${config.APP_DOMAIN}`)
		expect(mail?.html).toMatch(/\/api\/branding\/logo\?v=\d+/)
		expect(mail?.html).toContain('background-color:#0f766e')

		const plain = `plain-${Date.now()}@test.local`
		await deliverEmail({ name: 'Dinastia', slug: '' }, magicLinkEmail, {
			to: plain,
			data: { url: 'http://example.test/x' },
		})
		expect(memoryOutbox.findLast((m) => m.to === plain)?.html).toContain('background-color:#171717')
	})
})
