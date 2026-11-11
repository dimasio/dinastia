// HTTP-хелперы тестов API: запросы «из браузера» на нужный хост с cookie сессии.
import { createApp } from '#/app.ts'
import { TEST_PASSWORD, uniqueEmail } from './users.ts'

export const app = createApp()
export const host = (slug?: string) => (slug ? `${slug}.dinastia.localhost:5173` : 'dinastia.localhost:5173')
// Свой /16 на тестовый процесс: лимиты better-auth общие в БД, и процессы с одинаковыми адресами мешали бы друг другу. Счётчик
// начинается со случайного места: файлы одного воркера идут подряд, и с нуля каждый повторял адреса предыдущего — регистрации
// упирались в лимит 5 в минуту на адрес (4.8)
let ip = Math.floor(Math.random() * 60_000)
const subnet = `10.${100 + Number(process.env.VITEST_POOL_ID ?? 0)}`

export function call(method: string, path: string, opts: { slug?: string; cookie?: string; body?: unknown } = {}) {
	const h = host(opts.slug)
	return app.request(path, {
		method,
		headers: {
			host: h,
			origin: `http://${h}`,
			'x-forwarded-for': `${subnet}.${Math.floor(++ip / 250)}.${ip % 250}`,
			...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
			...(opts.cookie ? { cookie: opts.cookie } : {}),
		},
		...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
	})
}

/** Зарегистрировать пользователя через better-auth и вернуть cookie сессии. */
export async function signUp(prefix = 'u', name = 'Тест') {
	const email = uniqueEmail(prefix)
	const res = await call('POST', '/api/auth/sign-up/email', { body: { email, password: TEST_PASSWORD, name } })
	if (res.status !== 200) throw new Error(`sign-up ${res.status}`)
	const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
	return { email, cookie, id: ((await res.json()) as { user: { id: string } }).user.id }
}
