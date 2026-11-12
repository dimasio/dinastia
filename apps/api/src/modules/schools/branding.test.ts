// Оформление школы (5.9): публичная раздача темы по адресу школы — CSS с ETag, логотип редиректом, тема Dinastia на корне.
import { schools } from '@dinastia/db'
import { inArray } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { createApp } from '#/app.ts'
import { config } from '#/kernel/config.ts'
import { db, pool } from '#/kernel/db/client.ts'
import { withTenant } from '#/kernel/db/tenant.ts'
import { files } from '#/kernel/storage/schema.ts'
import { createUser, uniqueSlug } from '#/test/users.ts'
import { schoolBranding } from './schema.ts'
import { createSchool } from './service.ts'

const created: string[] = []
afterAll(async () => {
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
