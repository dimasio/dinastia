// e2e-фикстуры (скилл testing): вход по роли без UI-формы, адреса школ.
import { execFileSync } from 'node:child_process'
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
export const rootUrl = (path = '/') => `http://dinastia.localhost:5173${path}`

/**
 * Школа сразу с владельцем (CLI `src/create-school.ts`): публичной регистрации нет, школы создаёт оператор в /ops (5.6) —
 * сценарии, которым нужна своя школа, создают её так и входят паролем (`loginAs({ email, password }, slug)`).
 */
export function createSchool(o: { slug: string; name: string; email: string; password: string; ownerName?: string }) {
	execFileSync(
		'pnpm',
		[
			'--filter',
			'@dinastia/api',
			'exec',
			'tsx',
			'src/create-school.ts',
			o.slug,
			o.name,
			o.email,
			o.password,
			...(o.ownerName ? [o.ownerName] : []),
		],
		{ stdio: 'pipe' },
	)
}

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
	cspGuard: undefined
}>({
	// нарушение политики безопасности контента (5.1) — ошибка сценария: страница работает под той же CSP, что в production
	cspGuard: [
		async ({ context }, use) => {
			const violations: string[] = []
			context.on('console', (m) => {
				if (/Content Security Policy/i.test(m.text())) violations.push(m.text())
			})
			await use(undefined)
			expect(violations, 'нарушения CSP').toEqual([])
		},
		{ auto: true },
	],
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

/** Новый курс с одним уроком — и сразу в конструктор урока (клик по уроку в конструкторе курса). */
export async function openNewLesson(page: Page, title: string) {
	const run = Date.now().toString(36)
	await page.goto(schoolUrl('demo', '/admin/courses'))
	await page.getByTestId('resource-courses-create').click()
	await page.getByTestId('resource-courses-create-form').getByLabel('Название').fill(`Урок ${run} ${title}`)
	await page.getByTestId('resource-courses-create-form-submit').click()
	await page.getByRole('link', { name: `Урок ${run} ${title}` }).click()
	await page.getByTestId('course-add-section').click()
	await page.getByTestId('course-new-section').fill('Раздел')
	await page.getByTestId('course-new-section').press('Enter')
	await page.getByTestId('course-add-lesson').click()
	await page.getByTestId('course-new-lesson').fill(title)
	await page.getByTestId('course-new-lesson').press('Enter')
	await page.getByTestId('course-lesson-title').filter({ hasText: title }).click()
	await expect(page.getByTestId('lesson-editor')).toBeVisible()
	await expect(page.getByTestId('lesson-title')).toHaveText(title)
}

export { expect }
