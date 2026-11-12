// Конструктор курса (карточка 2.2): разделы и уроки — добавить, переименовать по месту, переставить (перетаскиванием
// и из меню), перенести урок в другой раздел, удалить с подтверждением; куратор — только просмотр.
import { expect, openDemoCourse, type Page, schoolUrl, test } from './fixtures.ts'
import { shoot } from './shots.ts'

const run = Date.now().toString(36)
const titles = (page: Page, testId: string) => page.getByTestId(testId).allTextContents()

async function newCourse(page: Page, title: string) {
	await page.goto(schoolUrl('demo', '/admin/courses'))
	await page.getByTestId('resource-courses-create').click()
	await page.getByTestId('resource-courses-create-form').getByLabel('Название').fill(title)
	await page.getByTestId('resource-courses-create-form-submit').click()
	await page.getByRole('link', { name: title }).click()
	await expect(page.getByTestId('course-builder')).toBeVisible()
}

async function addSection(page: Page, title: string) {
	await page.getByTestId('course-add-section').click()
	await page.getByTestId('course-new-section').fill(title)
	await page.getByTestId('course-new-section').press('Enter')
	await expect(page.getByTestId('course-section-title').filter({ hasText: title })).toBeVisible()
}

async function addLesson(page: Page, section: string, title: string) {
	const s = page.getByTestId('course-section').filter({ hasText: section })
	await s.getByTestId('course-add-lesson').click()
	await s.getByTestId('course-new-lesson').fill(title)
	await s.getByTestId('course-new-lesson').press('Enter')
	await expect(s.getByTestId('course-lesson-title').filter({ hasText: title })).toBeVisible()
}

test('преподаватель собирает структуру курса', async ({ page, loginAs }) => {
	test.setTimeout(90_000)
	await loginAs('teacher')
	await newCourse(page, `Конструктор ${run}`)
	await expect(page.getByText('В курсе пока нет разделов')).toBeVisible()

	await addSection(page, 'Введение')
	await addSection(page, 'Практика')
	await addLesson(page, 'Введение', 'Знакомство')
	await addLesson(page, 'Введение', 'Материалы')
	await addLesson(page, 'Практика', 'Первая работа')

	// переименование по месту — из меню
	const intro = page.getByTestId('course-section').filter({ hasText: 'Введение' })
	await intro.getByTestId('course-lesson').filter({ hasText: 'Материалы' }).getByTestId('course-item-menu').click()
	await page.getByTestId('course-menu-rename').click()
	const input = page.getByTestId('course-lesson-title-input')
	await input.fill('Бумага и кисти')
	await input.press('Enter')
	await expect(intro.getByTestId('course-lesson-title').nth(1)).toHaveText('Бумага и кисти')

	// урок — в другой раздел (меню «В раздел…»)
	await intro.getByTestId('course-lesson').filter({ hasText: 'Знакомство' }).getByTestId('course-item-menu').click()
	await page.getByTestId('course-menu-to').click()
	await page.getByRole('menuitem', { name: 'Практика' }).click()
	const practice = page.getByTestId('course-section').filter({ hasText: 'Практика' })
	await expect(practice.getByTestId('course-lesson-title')).toHaveText(['Первая работа', 'Знакомство'])

	// порядок разделов — перетаскиванием за ручку
	const handle = practice.getByRole('button', { name: 'Перетащить' }).first()
	const target = intro.getByTestId('course-section-title')
	const from = await handle.boundingBox()
	const to = await target.boundingBox()
	if (!from || !to) throw new Error('нет координат')
	await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
	await page.mouse.down()
	await page.mouse.move(to.x + 10, to.y - 10, { steps: 12 })
	await page.mouse.up()
	await expect.poll(() => titles(page, 'course-section-title')).toEqual(['Практика', 'Введение'])

	// и обратно — из меню «Ниже»
	await practice.getByTestId('course-item-menu').first().click()
	await page.getByTestId('course-menu-down').click()
	await expect.poll(() => titles(page, 'course-section-title')).toEqual(['Введение', 'Практика'])

	// после перезагрузки — то же (сохранилось на сервере)
	await page.reload()
	await expect.poll(() => titles(page, 'course-section-title')).toEqual(['Введение', 'Практика'])
	await expect(
		page.getByTestId('course-section').filter({ hasText: 'Практика' }).getByTestId('course-lesson-title'),
	).toHaveText(['Первая работа', 'Знакомство'])

	// удаление раздела — с подтверждением и числом уроков
	await page
		.getByTestId('course-section')
		.filter({ hasText: 'Практика' })
		.getByTestId('course-item-menu')
		.first()
		.click()
	await page.getByTestId('course-menu-remove').click()
	await expect(page.getByRole('alertdialog')).toContainText('удалятся 2 темы')
	await page.getByTestId('course-confirm').click()
	await expect.poll(() => titles(page, 'course-section-title')).toEqual(['Введение'])
	await shoot(page, 'course-builder')
})

test('куратор видит структуру демо-курса без инструментов правки', async ({ page, loginAs }) => {
	await loginAs('curator')
	await openDemoCourse(page)
	await expect(page.getByTestId('course-section')).toHaveCount(2)
	await expect(page.getByTestId('course-add-section')).toHaveCount(0)
	await expect(page.getByTestId('course-add-lesson')).toHaveCount(0)
	await expect(page.getByTestId('course-item-menu')).toHaveCount(0)
	await expect(page.getByRole('button', { name: 'Перетащить' })).toHaveCount(0)
})
