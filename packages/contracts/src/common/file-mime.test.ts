import { describe, expect, it } from 'vitest'
import { fileMime } from './file-mime.ts'

describe('fileMime', () => {
	it('тип от браузера — как есть', () => {
		expect(fileMime({ name: 'a.docx', type: 'text/plain' })).toBe('text/plain')
	})
	it('пустой тип (Windows без Office) — по расширению, без учёта регистра', () => {
		expect(fileMime({ name: 'Приказ.DOCX', type: '' })).toBe(
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		)
		expect(fileMime({ name: 'slides.pptx', type: '' })).toBe(
			'application/vnd.openxmlformats-officedocument.presentationml.presentation',
		)
	})
	it('неизвестное расширение — пусто (сервер отклонит)', () => {
		expect(fileMime({ name: 'run.exe', type: '' })).toBe('')
		expect(fileMime({ name: 'noext', type: '' })).toBe('')
	})
})
