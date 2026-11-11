// Консоль оператора (карточка 5.6а): оператор включает второй фактор, создаёт школу; владелец по письму принимает оферту и
// становится владельцем; повторный вход оператора — паролем и кодом из приложения. Публичной регистрации нет.
import { execFileSync } from 'node:child_process'
import { totp } from '../../apps/api/src/test/totp.ts'
import { expect, rootUrl, schoolUrl, test } from './fixtures.ts'
import { waitForLink } from './mailpit.ts'

const run = Date.now().toString(36)
const shots = (name: string) => ({ path: `test-results/screens/${name}.png`, fullPage: true })

test('оператор: второй фактор, создание школы, владелец по приглашению', async ({ page, browser }) => {
	test.setTimeout(120_000)
	const opsEmail = `ops-${run}@e2e.local`
	const out = execFileSync(
		'pnpm',
		['--filter', '@dinastia/api', 'exec', 'tsx', 'src/ops-grant.ts', opsEmail, 'Оператор'],
		{
			encoding: 'utf8',
		},
	)
	const password = out.match(/разовый пароль: ([\w-]+)/)?.[1] as string
	expect(password).toBeTruthy()

	// публичной регистрации нет
	await page.goto(rootUrl('/register'))
	await expect(page.getByText('Страница не найдена')).toBeVisible()

	// вход паролем (второго фактора ещё нет) → консоль просит его включить
	await page.goto(rootUrl())
	await page.getByTestId('auth-signin-email').fill(opsEmail)
	await page.getByTestId('auth-signin-password').fill(password)
	await page.getByTestId('auth-signin-submit').click()
	await expect(page.getByTestId('schools-mine')).toBeVisible()
	await page.goto(rootUrl('/ops'))
	await page.getByTestId('ops-2fa-password').fill(password)
	await page.getByTestId('ops-2fa-start').click()
	const secret = (await page.getByTestId('ops-2fa-secret').textContent()) as string
	await page.screenshot(shots('5.6-2fa'))
	await page.getByTestId('ops-2fa-code').fill(totp(secret))
	await page.getByTestId('ops-2fa-verify').click()

	// создание школы
	const slug = `ops-${run}`
	const ownerEmail = `owner-ops-${run}@e2e.local`
	await page.getByTestId('resource-schools-create').click()
	const form = page.getByTestId('resource-schools-create-form')
	await form.getByLabel('Школа').fill('Школа из консоли')
	await form.getByLabel('Адрес').fill(slug)
	await form.getByLabel('Владелец').fill(ownerEmail)
	await page.screenshot(shots('5.6-create-school'))
	await form.getByTestId('resource-schools-create-form-submit').click()
	await expect(page.getByText('Школа создана, приглашение отправлено владельцу')).toBeVisible()
	await page.goto(rootUrl(`/ops?q=${slug}`))
	await expect(page.getByTestId('resource-schools-row')).toHaveCount(1)
	await expect(page.getByTestId('resource-schools-row')).toContainText('Работает')

	// владелец: письмо → вход по ссылке → оферта и политика → владелец
	const owner = await (await browser.newContext({ locale: 'ru-RU' })).newPage()
	await owner.goto(await waitForLink(ownerEmail, /http:\/\/\S+\/invite\/\S+/))
	await expect(owner.getByTestId('invite-card')).toContainText('Владелец')
	await owner.getByTestId('auth-signin-submit').click()
	await owner.goto(await waitForLink(ownerEmail, /http:\/\/\S+\/api\/auth\/magic-link\/verify\S+/))
	await expect(owner.getByTestId('pd-consent')).toContainText('оферту')
	await expect(owner.getByTestId('invite-accept')).toBeDisabled()
	await owner.getByTestId('pd-consent-checkbox').check()
	await owner.getByTestId('invite-accept').click()
	await expect(owner).toHaveURL(schoolUrl(slug, '/admin'))
	await expect(owner.getByTestId('admin-school-name')).toHaveText('Школа из консоли')

	// карточка школы: владелец среди сотрудников; поиск человека; журнал консоли
	await page.goto(rootUrl(`/ops?q=${slug}`))
	await page.getByTestId('resource-schools-row').getByRole('link', { name: 'Школа из консоли' }).click()
	await expect(page.getByTestId('ops-school-staff')).toContainText(ownerEmail)
	await expect(page.getByTestId('ops-metric-students')).toHaveText('0')
	await page.screenshot(shots('5.6-school-card'))

	// приостановка: владелец видит баннер с причиной, гость на входе — «приостановлена»; затем возобновление
	await page.getByTestId('ops-suspend').click()
	await page.getByTestId('ops-suspend-reason').fill('Не оплачен тариф')
	await page.getByTestId('ops-suspend-submit').click()
	await expect(page.getByTestId('ops-school-status')).toHaveText('Приостановлена')
	await owner.goto(schoolUrl(slug, '/admin'))
	await expect(owner.getByTestId('school-suspended-banner')).toContainText('Не оплачен тариф')
	await owner.screenshot(shots('5.6-suspended-owner'))
	const guest = await (await browser.newContext({ locale: 'ru-RU' })).newPage()
	await guest.goto(schoolUrl(slug, '/login'))
	await expect(guest.getByTestId('login-title')).toHaveText('Школа «Школа из консоли» приостановлена')
	await page.getByTestId('ops-resume').click()
	await expect(page.getByTestId('ops-school-status')).toHaveText('Работает')
	await guest.reload()
	await expect(guest.getByTestId('login-title')).toHaveText('Вход в школу «Школа из консоли»')
	await page.getByTestId('ops-nav-people').click()
	await page.getByTestId('ops-people-email').fill(ownerEmail)
	await page.getByTestId('ops-people-find').click()
	await expect(page.getByTestId('ops-person-schools')).toContainText('Школа из консоли')
	await expect(page.getByTestId('ops-person-schools')).toContainText('Владелец')
	await page.getByTestId('ops-nav-audit').click()
	await expect(page.getByTestId('resource-audit-row').first()).toContainText('Искал человека')
	await page.screenshot(shots('5.6-audit'))

	// повторный вход оператора — пароль, затем код (код следующего шага: текущий уже использован)
	const again = await (await browser.newContext({ locale: 'ru-RU' })).newPage()
	await again.goto(rootUrl())
	await again.getByTestId('auth-signin-email').fill(opsEmail)
	await again.getByTestId('auth-signin-password').fill(password)
	await again.getByTestId('auth-signin-submit').click()
	await again.getByTestId('auth-signin-code').fill(totp(secret, Date.now() + 30_000))
	await again.screenshot(shots('5.6-signin-code'))
	await again.getByTestId('auth-signin-code-submit').click()
	await expect(again.getByTestId('schools-mine')).toBeVisible()
	await again.goto(rootUrl('/ops'))
	await expect(again.getByTestId('resource-schools-create')).toBeVisible()
})

test('не оператор в /ops — «не найдено»', async ({ page, loginAs }) => {
	await loginAs('admin')
	await page.goto(rootUrl('/ops'))
	await expect(page.getByText('Страница не найдена')).toBeVisible()
})

test('вход от имени: школа открывает доступ, оператор входит как преподаватель и возвращается', async ({
	page,
	browser,
	loginAs,
}) => {
	test.setTimeout(120_000)
	// оператор со вторым фактором
	const email = `ops2-${run}@e2e.local`
	const out = execFileSync('pnpm', ['--filter', '@dinastia/api', 'exec', 'tsx', 'src/ops-grant.ts', email], {
		encoding: 'utf8',
	})
	const password = out.match(/разовый пароль: ([\w-]+)/)?.[1] as string
	const ops = await (await browser.newContext({ locale: 'ru-RU' })).newPage()
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
	await expect(ops.getByTestId('resource-schools-create')).toBeVisible()

	// владелец демо-школы открывает доступ поддержки
	await loginAs('owner')
	await page.goto(schoolUrl('demo', '/admin/settings'))
	await expect(page.getByTestId('support-access-state')).toBeVisible()
	if ((await page.getByTestId('support-access-state').textContent())?.includes('закрыт'))
		await page.getByTestId('support-access-toggle').click()
	await expect(page.getByTestId('support-access-state')).toContainText('Открыт до')

	try {
		await ops.goto(rootUrl('/ops?q=demo'))
		await ops.getByTestId('resource-schools-row').getByRole('link', { name: 'Демо-школа' }).click()
		await expect(ops.getByTestId('ops-support-access')).toContainText('разрешила')
		await ops.getByTestId('ops-impersonate-teacher').first().click()
		await expect(ops).toHaveURL(schoolUrl('demo', '/admin'))
		await expect(ops.getByTestId('impersonation-banner')).toContainText('поддержка Dinastia')
		await ops.screenshot(shots('5.6-impersonation'))
		await ops.getByTestId('impersonation-stop').click()
		await expect(ops).toHaveURL(/\/ops\/schools\//)
		await expect(ops.getByTestId('ops-school-card')).toContainText('Вошёл от имени участника')
	} finally {
		// демо-школа общая для сценариев — доступ закрываем
		await page.reload()
		if ((await page.getByTestId('support-access-state').textContent())?.includes('Открыт'))
			await page.getByTestId('support-access-toggle').click()
		await expect(page.getByTestId('support-access-state')).toContainText('закрыт')
	}
})
