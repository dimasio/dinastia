// Демо фазы 5 (docs/tasks/phase-5-launch/task.md): запуск школы целиком. Оператор создаёт школу в /ops, владелец принимает
// приглашение и приглашает преподавателя; преподаватель собирает курс с сертификатом и приглашает ученика; ученик проходит курс и
// скачивает сертификат; владелец открывает доступ поддержки, оператор находит школу и входит от имени преподавателя — вход
// виден в журнале консоли. Восстановление бэкапа и прогон против стенда — на стенде (5.3).
import { execFileSync } from 'node:child_process'
import type { Browser, Page } from '@playwright/test'
import { totp } from '../../apps/api/src/test/totp.ts'
import { expect, rootUrl, schoolUrl, test } from './fixtures.ts'
import { waitForLink } from './mailpit.ts'
import { shoot } from './shots.ts'

const run = Date.now().toString(36)
const SLUG = `launch-${run}`
const SCHOOL = 'Школа запуска'
const COURSE = `Первый курс ${run}`
const OWNER = `owner-${run}@e2e.local`
const TEACHER = `teacher-${run}@e2e.local`
const STUDENT = `student-${run}@e2e.local`
const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })

/** Вызов REST API из страницы (cookie сессии — у браузера). */
const api = (page: Page, method: string, path: string, body?: unknown) =>
	page.evaluate(
		async ([m, p, b]) => {
			const r = await fetch(`/api/v1${p}`, {
				method: m,
				headers: { 'content-type': 'application/json' },
				...(b === undefined ? {} : { body: JSON.stringify(b) }),
			})
			if (!r.ok) throw new Error(`${p}: ${r.status} ${await r.text()}`)
			return r.json()
		},
		[method, path, body] as const,
	)

const newPage = async (browser: Browser) => (await browser.newContext({ locale: 'ru-RU' })).newPage()

/** Сотрудник по письму-приглашению: вход по ссылке, согласие, принять. */
async function acceptInvite(page: Page, email: string, role: string) {
	await page.goto(await waitForLink(email, /http:\/\/\S+\/invite\/\S+/))
	await expect(page.getByTestId('invite-card')).toContainText(role)
	await page.getByTestId('auth-signin-submit').click()
	await page.goto(await waitForLink(email, /http:\/\/\S+\/api\/auth\/magic-link\/verify\S+/))
	await page.getByTestId('pd-consent-checkbox').check()
	await page.getByTestId('invite-accept').click()
	await expect(page).toHaveURL(schoolUrl(SLUG, '/admin'))
}

test('демо фазы 5: оператор создаёт школу → курс → ученик по приглашению → сертификат → вход от имени', async ({
	browser,
}) => {
	test.setTimeout(300_000)
	const ops = await newPage(browser)

	await test.step('оператор: второй фактор и новая школа с владельцем', async () => {
		const email = `ops-${run}@e2e.local`
		const out = execFileSync('pnpm', ['--filter', '@dinastia/api', 'exec', 'tsx', 'src/ops-grant.ts', email], {
			encoding: 'utf8',
		})
		const password = out.match(/разовый пароль: ([\w-]+)/)?.[1] as string
		await ops.goto(rootUrl())
		await ops.getByTestId('auth-signin-email').fill(email)
		await ops.getByTestId('auth-signin-password').fill(password)
		await ops.getByTestId('auth-signin-submit').click()
		await expect(ops.getByTestId('schools-mine')).toBeVisible()
		await ops.goto(rootUrl('/ops'))
		await ops.getByTestId('ops-2fa-password').fill(password)
		await ops.getByTestId('ops-2fa-start').click()
		const secret = (await ops.getByTestId('ops-2fa-secret').textContent()) as string
		await ops.getByTestId('ops-2fa-code').fill(totp(secret))
		await ops.getByTestId('ops-2fa-verify').click()

		await ops.getByTestId('resource-schools-create').click()
		const form = ops.getByTestId('resource-schools-create-form')
		await form.getByLabel('Учебный центр').fill(SCHOOL)
		await form.getByLabel('Адрес').fill(SLUG)
		await form.getByLabel('Владелец').fill(OWNER)
		await form.getByTestId('resource-schools-create-form-submit').click()
		await expect(ops.getByText('Учебный центр создан, приглашение отправлено владельцу')).toBeVisible()
	})

	const owner = await newPage(browser)
	await test.step('владелец принимает приглашение и приглашает преподавателя', async () => {
		await acceptInvite(owner, OWNER, 'Владелец')
		await expect(owner.getByTestId('admin-school-name')).toHaveText(SCHOOL)
		await api(owner, 'POST', '/school/invitations', { email: TEACHER, role: 'teacher' })
	})

	const teacher = await newPage(browser)
	const courseId = await test.step('преподаватель: курс с уроком и сертификатом, приглашает ученика', async () => {
		await acceptInvite(teacher, TEACHER, 'Преподаватель')
		const course = await api(teacher, 'POST', '/courses', { title: COURSE })
		const section = await api(teacher, 'POST', `/courses/${course.id}/sections`, { title: 'Начало' })
		const lesson = await api(teacher, 'POST', `/sections/${section.id}/lessons`, { title: 'Добро пожаловать' })
		const text = await api(teacher, 'POST', `/lessons/${lesson.id}/blocks`, { type: 'text' })
		await api(teacher, 'PATCH', `/blocks/${text.id}`, { data: { body: doc('Рады видеть вас на курсе') } })
		await api(teacher, 'POST', `/lessons/${lesson.id}/publish`, {})
		await api(teacher, 'POST', `/courses/${course.id}/publish`, {})
		const template = await api(teacher, 'GET', `/courses/${course.id}/certificate-template`)
		const { courseId: _, signatureUrl: _s, backgroundUrl: _b, ...fields } = template
		await api(teacher, 'PUT', `/courses/${course.id}/certificate-template`, { ...fields, enabled: true })
		const r = await api(teacher, 'POST', `/courses/${course.id}/enrollments`, { email: STUDENT })
		expect(r.outcome).toBe('invited')
		return course.id as string
	})

	await test.step('ученик: приглашение → курс пройден → сертификат', async () => {
		const student = await newPage(browser)
		await student.goto(await waitForLink(STUDENT, /http:\/\/\S+\/join\/\S+/))
		await expect(student.getByTestId('join-card')).toContainText(COURSE)
		await student.getByTestId('auth-signin-email').fill(STUDENT)
		await student.getByTestId('auth-signin-submit').click()
		await student.goto(await waitForLink(STUDENT, /http:\/\/\S+\/api\/auth\/magic-link\/verify\S+/))
		await student.getByTestId('pd-consent-checkbox').check()
		await student.getByTestId('join-accept').click()
		await expect(student).toHaveURL(new RegExp(`/learn/courses/${courseId}$`))
		await student.goto(schoolUrl(SLUG, '/learn'))
		await student.getByTestId('home-continue-action').click()
		await expect(student.getByText('Рады видеть вас на курсе')).toBeVisible()

		const link = await waitForLink(STUDENT, new RegExp(`http://\\S+/learn/courses/${courseId}(?=\\s|$)`), 60_000)
		await student.goto(link)
		const button = student.getByTestId('my-certificate')
		await expect(button).toBeVisible({ timeout: 30_000 })
		const download = student.waitForEvent('download')
		await button.click()
		expect((await download).suggestedFilename()).toMatch(/^Удостоверение .+\.pdf$/)
		await shoot(student, 'phase-5-certificate')
		await student.close()
	})

	await test.step('владелец открывает доступ поддержки; оператор входит от имени преподавателя — видно в журнале', async () => {
		await owner.goto(schoolUrl(SLUG, '/admin/settings'))
		await expect(owner.getByTestId('support-access-state')).toContainText('закрыт')
		await owner.getByTestId('support-access-toggle').click()
		await expect(owner.getByTestId('support-access-state')).toContainText('Открыт до')

		await ops.goto(rootUrl(`/ops?q=${SLUG}`))
		await ops.getByTestId('resource-schools-row').getByRole('link', { name: SCHOOL }).click()
		await expect(ops.getByTestId('ops-metric-students')).toHaveText('1')
		await ops.getByTestId('ops-impersonate-teacher').click()
		await expect(ops).toHaveURL(schoolUrl(SLUG, '/admin'))
		await expect(ops.getByTestId('impersonation-banner')).toContainText('поддержка Dinastia')
		await ops.goto(schoolUrl(SLUG, '/admin/courses'))
		await expect(ops.getByRole('link', { name: COURSE })).toBeVisible()
		await shoot(ops, 'phase-5-impersonation')
		await ops.getByTestId('impersonation-stop').click()
		await expect(ops).toHaveURL(/\/ops\/schools\//)
		await expect(ops.getByTestId('ops-school-card')).toContainText('Вошёл от имени участника')
	})
	await Promise.all([ops.close(), owner.close(), teacher.close()])
})
