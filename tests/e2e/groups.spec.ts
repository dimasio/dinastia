// Потоки (карточка 4.2): преподаватель создаёт поток с куратором на вкладке «Потоки», видит поток учеников на «Учениках»,
// создаёт ссылку-приглашение в поток и удаляет поток; куратор видит только свой поток и его учеников.
import type { Page } from '@playwright/test'
import { expect, schoolUrl, test } from './fixtures.ts'
import { shoot } from './shots.ts'

const run = Date.now().toString(36)
const MINE = `Поток куратора ${run}`
const OTHER = `Чужой поток ${run}`

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

test('поток с куратором: создание, ученики потока, ссылка в поток, область куратора, удаление', async ({
	page,
	loginAs,
	browser,
}) => {
	test.setTimeout(120_000)
	await loginAs('teacher')
	await page.goto(schoolUrl('demo', '/admin/courses'))
	// опубликованный курс с уроком
	const course = await api(page, 'POST', '/courses', { title: `Потоки ${run}` })
	const section = await api(page, 'POST', `/courses/${course.id}/sections`, { title: 'Раздел' })
	const lesson = await api(page, 'POST', `/sections/${section.id}/lessons`, { title: 'Урок' })
	const block = await api(page, 'POST', `/lessons/${lesson.id}/blocks`, { type: 'text' })
	await api(page, 'PATCH', `/blocks/${block.id}`, {
		data: { body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Текст' }] }] } },
	})
	await api(page, 'POST', `/lessons/${lesson.id}/publish`, {})
	await api(page, 'POST', `/courses/${course.id}/publish`, {})

	// пустая вкладка «Потоки» → создать поток с куратором
	await page.goto(schoolUrl('demo', `/admin/courses/${course.id}`))
	await page.getByTestId('course-tab-groups').click()
	await expect(page).toHaveURL(/\/groups$/)
	await expect(page.getByText('На курсе пока нет потоков')).toBeVisible()
	await page.getByTestId('group-create').click()
	await page.getByTestId('group-title').fill(MINE)
	await page.getByTestId('group-days').fill('45')
	await page.getByTestId('group-curators').getByText('Кирилл Куратор').click()
	await shoot(page, '4.2-group-form', { mobile: false })
	await page.getByTestId('group-submit').click()
	await expect(page.getByText(`Поток «${MINE}» создан`)).toBeVisible()
	const mine = page.getByTestId('group-row').filter({ hasText: MINE })
	await expect(mine).toContainText('Кирилл Куратор')
	await expect(mine).toContainText('доступ 45 дней')

	// второй поток без куратора и два ученика — по одному в каждый поток
	const groups = (await api(page, 'GET', `/courses/${course.id}/groups`)) as { id: string; title: string }[]
	const mineId = groups.find((g) => g.title === MINE)?.id as string
	const other = await api(page, 'POST', `/courses/${course.id}/groups`, { title: OTHER })
	await api(page, 'POST', `/courses/${course.id}/enrollments`, { email: 'student1@demo.local', groupId: mineId })
	await api(page, 'POST', `/courses/${course.id}/enrollments`, { email: 'student2@demo.local', groupId: other.id })
	await page.reload()
	await expect(page.getByTestId('group-row')).toHaveCount(2)
	await expect(page.getByTestId('group-row').filter({ hasText: MINE })).toContainText('1 ученик')
	await shoot(page, '4.2-groups')

	// «Ученики»: колонка «Поток»; ссылка-приглашение в поток
	await page.getByTestId('course-tab-learners').click()
	await expect(page.getByTestId('resource-enrollments-row').filter({ hasText: 'student1@demo.local' })).toContainText(
		MINE,
	)
	await page.getByTestId('invites-open').click()
	await page.getByTestId('invite-group').click()
	await page.getByRole('option', { name: MINE }).click()
	await page.getByTestId('invite-create').click()
	await expect(page.getByTestId('invite-created')).toBeVisible()
	await expect(page.getByTestId('invite-row').first()).toContainText(`в поток «${MINE}»`)
	await page.keyboard.press('Escape')

	// куратор: только свой поток и его ученик, без действий
	const curator = await (await browser.newContext({ locale: 'ru-RU' })).newPage()
	await curator.goto(schoolUrl('demo', '/login'))
	await curator.evaluate(async () => {
		const r = await fetch('/api/auth/sign-in/email', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email: 'curator@demo.local', password: 'demo12345' }),
		})
		if (!r.ok) throw new Error(`вход: ${r.status}`)
	})
	await curator.goto(schoolUrl('demo', `/admin/courses/${course.id}/groups`))
	await expect(curator.getByTestId('group-row')).toHaveCount(1)
	await expect(curator.getByTestId('group-row')).toContainText(MINE)
	await expect(curator.getByTestId('group-create')).toHaveCount(0)
	await expect(curator.getByTestId('group-edit')).toHaveCount(0)
	await curator.goto(schoolUrl('demo', `/admin/courses/${course.id}/learners`))
	await expect(curator.getByTestId('resource-enrollments-row')).toHaveCount(1)
	await expect(curator.getByTestId('resource-enrollments-row')).toContainText('student1@demo.local')
	await shoot(curator, '4.2-curator-learners', { mobile: false })
	await curator.close()

	// удаление чужого потока: ученик остаётся на курсе без потока
	await page.getByTestId('course-tab-groups').click()
	await page.getByTestId('group-row').filter({ hasText: OTHER }).getByTestId('group-remove').click()
	await expect(page.getByText('останется на курсе без потока', { exact: false })).toBeVisible()
	await page.getByTestId('group-remove-confirm').click()
	await expect(page.getByText(`Поток «${OTHER}» удалён`)).toBeVisible()
	await expect(page.getByTestId('group-row')).toHaveCount(1)
	await page.getByTestId('course-tab-learners').click()
	const second = page.getByTestId('resource-enrollments-row').filter({ hasText: 'student2@demo.local' })
	await expect(second).toContainText('—')

	// перевод в поток из таблицы и фильтр по потоку
	await second.getByTestId('resource-enrollments-row-actions').click()
	await page.getByTestId('resource-enrollments-action-move').click()
	await page.getByTestId('resource-enrollments-action-move-form-groupId').click()
	await page.getByRole('option', { name: MINE }).click()
	await page.getByTestId('resource-enrollments-action-move-form-submit').click()
	await expect(second).toContainText(MINE)
	await page.getByTestId('resource-enrollments-filter-groupId').click()
	await page.getByRole('option', { name: 'Без потока' }).click()
	await expect(page.getByText('Ничего не нашлось')).toBeVisible()
	await page.getByTestId('resource-enrollments-filter-groupId').click()
	await page.getByRole('option', { name: MINE }).click()
	await expect(page.getByTestId('resource-enrollments-row')).toHaveCount(2)
	await shoot(page, '4.2-learners-groups', { mobile: false })
})
