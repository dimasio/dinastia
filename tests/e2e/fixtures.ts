// e2e-фикстуры (скилл testing): вход по роли без UI-формы, адреса школ.
import { test as base, expect, type Page } from '@playwright/test'

/** Демо-пользователи из pnpm db:seed (скилл local-env); пароль у всех — demo12345. */
export const DEMO = {
	owner: 'owner@demo.local',
	admin: 'admin@demo.local',
	teacher: 'teacher@demo.local',
	curator: 'curator@demo.local',
	student: 'student1@demo.local',
} as const

export const schoolUrl = (slug: string, path = '/') => `http://${slug}.dinastia.localhost:5173${path}`

/**
 * Войти через API из браузера (не через форму): Node на macOS не резолвит *.localhost, поэтому запрос идёт из
 * страницы; cookie сессии ставит браузер. Форму входа проверяют отдельные сценарии.
 */
async function signIn(page: Page, email: string, slug: string, password = 'demo12345') {
	await page.goto(schoolUrl(slug, '/login'))
	const status = await page.evaluate(
		async ([e, p]) =>
			(
				await fetch('/api/auth/sign-in/email', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ email: e, password: p }),
				})
			).status,
		[email, password] as const,
	)
	expect(status, `вход ${email}`).toBe(200)
}

export const test = base.extend<{
	loginAs: (who: keyof typeof DEMO | { email: string; password?: string }, slug?: string) => Promise<void>
}>({
	loginAs: async ({ page }, use) => {
		await use(async (who, slug = 'demo') => {
			if (typeof who === 'string') await signIn(page, DEMO[who], slug)
			else await signIn(page, who.email, slug, who.password)
		})
	},
})

/**
 * Открыть конструктор демо-курса «Основы акварели» — через поиск: сценарии копят курсы в демо-школе, и на первой
 * странице списка (по дате изменения) демо-курса может не быть.
 */
export async function openDemoCourse(page: Page) {
	await page.goto(schoolUrl('demo', '/admin/courses'))
	await page.getByTestId('resource-courses-search').fill('Основы акварели')
	await page.getByRole('link', { name: 'Основы акварели', exact: true }).click()
	await expect(page.getByTestId('course-builder')).toBeVisible()
}

export { expect }
