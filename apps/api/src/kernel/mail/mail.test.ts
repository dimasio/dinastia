// Шаблоны писем (пункт 1.8): каждый пример каждого письма рендерится; данные экранируются; письмо уходит задачей.
import { afterAll, describe, expect, it } from 'vitest'
import { pool } from '#/kernel/db/client.ts'
import { invitationEmail } from '#/modules/schools/emails/invitation.tsx'
import { allEmails, emailByKey } from '../registry.ts'
import { renderEmail } from './define.tsx'
import { mailFor } from './send.ts'

afterAll(() => pool.end())

const school = { name: 'Школа рисования', slug: 'art' }

describe.each(allEmails().map((e) => [e.key, e] as const))('письмо %s', (_, email) => {
	it('примеры рендерятся: тема, HTML, текст без пропущенных строк', async () => {
		expect(email.examples.length).toBeGreaterThan(0)
		for (const data of email.examples) {
			const out = await renderEmail(email, data, school)
			expect(out.subject).not.toMatch(/emails:|\{\{/)
			expect(out.html).toContain('<html')
			expect(out.text).toContain(school.name)
			expect(out.text).not.toMatch(/emails:|common:|\{\{/) // ключ вместо строки — строки нет в i18n
		}
	})
})

describe('рендер', () => {
	it('данные экранируются, ссылка — в кнопке и в тексте', async () => {
		const out = await renderEmail(
			invitationEmail,
			{ ...invitationEmail.examples[0]!, inviterName: '<script>alert(1)</script>' },
			school,
		)
		expect(out.html).not.toContain('<script>alert(1)</script>')
		expect(out.html).toContain('&lt;script&gt;')
		expect(out.html).toContain('href="http://demo.dinastia.localhost:5173/invite/')
		expect(out.text).toContain('Ваша роль — Преподаватель')
	})

	it('данные не по схеме — ошибка до отправки', async () => {
		await expect(renderEmail(invitationEmail, { url: 'не ссылка' } as never, school)).rejects.toThrow()
	})

	it('незарегистрированное письмо в очередь не ставится', async () => {
		expect(emailByKey('schools.invitation')).toBe(invitationEmail)
		const mail = mailFor({ send: async () => null })
		await expect(
			mail.send({ ...invitationEmail }, { to: 'x@test.local', data: invitationEmail.examples[0]! }),
		).rejects.toThrow(/не зарегистрировано/)
	})
})
