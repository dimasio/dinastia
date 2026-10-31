import type { RichTextDoc } from '@dinastia/contracts/common'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { RichTextView } from './view.tsx'

const FILE = '0199e3a0-0000-7000-8000-000000000001'
const doc = (...content: object[]) => ({ type: 'doc', content }) as RichTextDoc
const p = (...content: object[]) => ({ type: 'paragraph', content })

describe('RichTextView', () => {
	it('разметка из JSON: метки, ссылки с rel, цвет — классом, картинка — через resolveFile', () => {
		const html = renderToStaticMarkup(
			<RichTextView
				resolveFile={(id) => (id === FILE ? 'https://files.example/a.png' : undefined)}
				doc={doc(
					{ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Тема' }] },
					p(
						{ type: 'text', text: 'жирно', marks: [{ type: 'bold' }] },
						{ type: 'text', text: 'ссылка', marks: [{ type: 'link', attrs: { href: 'https://e.com' } }] },
						{ type: 'text', text: 'синий', marks: [{ type: 'textStyle', attrs: { color: 'blue' } }] },
					),
					{ type: 'image', attrs: { fileId: FILE, alt: 'схема' } },
					{ type: 'image', attrs: { fileId: '0199e3a0-0000-7000-8000-000000000002' } },
				)}
			/>,
		)
		expect(html).toContain('<h3>Тема</h3>')
		expect(html).toContain('<strong>жирно</strong>')
		expect(html).toContain('<a href="https://e.com" target="_blank" rel="noopener noreferrer nofollow">ссылка</a>')
		expect(html).toContain('<span class="rt-color-blue">синий</span>')
		expect(html).toContain('src="https://files.example/a.png"')
		expect(html.match(/<img/g)).toHaveLength(1)
	})

	it('HTML в тексте — текст; опасная ссылка — без <a>', () => {
		const html = renderToStaticMarkup(
			<RichTextView
				doc={doc(
					p(
						{ type: 'text', text: '<img src=x onerror=alert(1)>' },
						{ type: 'text', text: 'клик', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] },
					),
				)}
			/>,
		)
		expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
		expect(html).not.toContain('<a')
		expect(html).not.toContain('javascript:')
	})
})
