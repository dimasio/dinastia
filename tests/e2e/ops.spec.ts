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
	await page.getByTestId('ops-school-name').fill('Школа из консоли')
	await page.getByTestId('ops-school-slug').fill(slug)
	await page.getByTestId('ops-school-owner').fill(ownerEmail)
	await page.getByTestId('ops-create-submit').click()
	await expect(page.getByTestId('ops-create-done')).toContainText('Школа «Школа из консоли» создана')
	await page.screenshot(shots('5.6-create-school'))

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
	await expect(again.getByTestId('ops-create-school')).toBeVisible()
})

test('не оператор в /ops — «не найдено»', async ({ page, loginAs }) => {
	await loginAs('admin')
	await page.goto(rootUrl('/ops'))
	await expect(page.getByText('Страница не найдена')).toBeVisible()
})
