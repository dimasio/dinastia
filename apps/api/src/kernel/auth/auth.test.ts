// Авторизация через HTTP так, как её видит браузер (D-007, скилл security-baseline).
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { createApp } from '#/app.ts'
import { db, pool } from '#/kernel/db/client.ts'
import { memoryOutbox } from '#/kernel/mail.ts'
import { TEST_PASSWORD, uniqueEmail } from '#/test/users.ts'
import { users } from './schema.ts'

afterAll(() => pool.end())

const app = createApp()
const SCHOOL_ORIGIN = 'http://demo.dinastia.localhost:5173'
let ipSeq = 0
const freshIp = () => `10.${process.pid % 250}.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`

function post(path: string, body: unknown, opts: { origin?: string; ip?: string; cookie?: string } = {}) {
	return app.request(`/api/auth${path}`, {
		method: 'POST',
		headers: {
			host: 'demo.dinastia.localhost:5173',
			origin: opts.origin ?? SCHOOL_ORIGIN,
			'content-type': 'application/json',
			'x-forwarded-for': opts.ip ?? freshIp(),
			...(opts.cookie ? { cookie: opts.cookie } : {}),
		},
		body: JSON.stringify(body),
	})
}

describe('email + пароль', () => {
	it('регистрация ставит cookie сессии на общий домен; id — uuid v7', async () => {
		const email = uniqueEmail('signup')
		const res = await post('/sign-up/email', { email, password: TEST_PASSWORD, name: 'Анна' })
		expect(res.status).toBe(200)
		const cookie = res.headers.get('set-cookie') ?? ''
		expect(cookie).toMatch(/session_token=/)
		expect(cookie).toMatch(/Domain=dinastia\.localhost/i)
		expect(cookie).toMatch(/HttpOnly/i)
		const [u] = await db.select().from(users).where(eq(users.email, email))
		expect(u?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/)
	})

	it('вход: верный пароль — 200, неверный — 401', async () => {
		const email = uniqueEmail('signin')
		await post('/sign-up/email', { email, password: TEST_PASSWORD, name: 'Борис' })
		expect((await post('/sign-in/email', { email, password: 'wrong-password' })).status).toBe(401)
		expect((await post('/sign-in/email', { email, password: TEST_PASSWORD })).status).toBe(200)
	})

	it('чужой origin отклоняется всегда: вход (login CSRF), действия по cookie (CSRF), magic link', async () => {
		const email = uniqueEmail('csrf')
		const up = await post('/sign-up/email', { email, password: TEST_PASSWORD, name: 'Вера' })
		const cookie = (up.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
		const evil = { origin: 'https://evil.example' }
		expect((await post('/sign-in/email', { email, password: TEST_PASSWORD }, evil)).status).toBe(403)
		expect((await post('/update-user', { name: 'Взлом' }, { ...evil, cookie })).status).toBe(403)
		expect((await post('/sign-out', {}, { ...evil, cookie })).status).toBe(403)
		expect((await post('/sign-in/magic-link', { email, callbackURL: '/' }, evil)).status).toBe(403)
	})

	it('magic link не уводит на чужой сайт после входа (open redirect)', async () => {
		const res = await post('/sign-in/magic-link', { email: uniqueEmail(), callbackURL: 'https://evil.example/steal' })
		expect(res.status).toBe(403)
	})

	it('подбор пароля упирается в лимит: 6-я попытка за минуту — 429', async () => {
		const ip = freshIp()
		const email = uniqueEmail('brute')
		const statuses: number[] = []
		for (let i = 0; i < 6; i++)
			statuses.push((await post('/sign-in/email', { email, password: 'nope-nope' }, { ip })).status)
		expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true)
		expect(statuses[5]).toBe(429)
	})
})

describe('magic link', () => {
	it('письмо со ссылкой на домен школы; переход по ссылке создаёт пользователя и сессию', async () => {
		const email = uniqueEmail('magic')
		const res = await post('/sign-in/magic-link', { email, callbackURL: '/admin' })
		expect(res.status).toBe(200)
		const mail = memoryOutbox.find((m) => m.to === email)
		const link = mail?.text.match(/https?:\/\/\S+/)?.[0]
		expect(link).toBeDefined()
		const url = new URL(link ?? '')
		expect(url.host).toBe('demo.dinastia.localhost:5173')

		const verify = await app.request(url.pathname + url.search, { headers: { host: url.host } })
		expect(verify.status).toBe(302)
		expect(verify.headers.get('location')).toMatch(/\/admin$/)
		expect(verify.headers.get('set-cookie') ?? '').toMatch(/session_token=/)
		const [u] = await db.select().from(users).where(eq(users.email, email))
		expect(u?.emailVerified).toBe(true)

		const reuse = await app.request(url.pathname + url.search, { headers: { host: url.host } })
		expect(reuse.headers.get('set-cookie') ?? '').not.toMatch(/session_token=[^;]+;/)
	})
})
