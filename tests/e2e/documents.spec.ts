// Просмотр документов в теме: PDF, Word и PowerPoint в блоке «Файл» показываются прямо в теме, без «Скачать».
// Word — с пустым типом файла, как в Windows без Office (тип — по расширению).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, openNewLesson, type Page, test } from './fixtures.ts'
import { shoot } from './shots.ts'

const fixture = (name: string) => readFileSync(join(import.meta.dirname, 'files', name))
const saved = (page: Page) => page.waitForResponse((r) => r.url().endsWith('/courses/blocks/update') && r.ok())

const DOCS = [
	{ name: 'Памятка.docx', file: 'pamyatka.docx', mimeType: '', kind: 'docx', text: 'Памятка: первая помощь' },
	{
		name: 'Слайды.pptx',
		file: 'slaidy.pptx',
		mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
		kind: 'pptx',
		text: 'Остановка кровотечения',
	},
	{ name: 'Инструкция.pdf', file: 'instrukciya.pdf', mimeType: 'application/pdf', kind: 'pdf', text: null },
] as const

test('документы: PDF, Word, PowerPoint — просмотр в теме без скачивания', async ({ page, loginAs }) => {
	test.setTimeout(90_000)
	await loginAs('teacher')
	await openNewLesson(page, 'Тема с документами')

	for (const [i, d] of DOCS.entries()) {
		await page.getByTestId('block-palette-file').click()
		await expect(page.getByTestId('lesson-block')).toHaveCount(i + 1)
		const block = page.getByTestId('lesson-block').last()
		const done = saved(page)
		await block
			.locator('input[type=file]')
			.setInputFiles({ name: d.name, mimeType: d.mimeType, buffer: fixture(d.file) })
		await done
		await expect(block).toContainText(d.name)
		await expect(block.getByTestId(/-preview-hint$/)).toContainText(
			d.kind === 'pptx' ? 'для точного вида загрузите PDF' : 'скачать его нельзя',
		)
	}

	await page.reload()
	await page.getByTestId('lesson-mode-preview').click()
	const preview = page.getByTestId('lesson-preview')
	for (const d of DOCS) {
		const viewer = preview.locator(`[data-kind="${d.kind}"]`)
		await expect(viewer).toHaveAttribute('data-state', 'ready', { timeout: 20_000 })
		if (d.text) await expect(viewer).toContainText(d.text)
		else await expect(viewer.locator('canvas')).toHaveCount(2) // две страницы
	}
	await expect(preview.getByRole('link', { name: 'Скачать' })).toHaveCount(0)
	await shoot(page, 'documents-preview')
})
