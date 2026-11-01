// Блоки контента (карточка 2.4): ссылки видео и встраиваний — только белый список, ученику — адрес плеера; код
// подсвечивается без HTML на странице (скилл security-baseline).
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { code } from './code/definition.ts'
import CodeViewer from './code/viewer.tsx'
import { blockDataIssues } from './define.ts'
import { divider } from './divider/definition.ts'
import { embed } from './embed/definition.ts'
import { heading } from './heading/definition.ts'
import HeadingViewer from './heading/viewer.tsx'
import { text } from './text/definition.ts'
import { video } from './video/definition.ts'

describe('видео и встраивание', () => {
	it('видео — только видеосервисы; ученику — адрес плеера, а не исходная ссылка', () => {
		const ok = video.schema.parse({ url: ' https://youtu.be/dQw4w9WgXcQ ', caption: 'Урок 1' })
		expect(video.toPublic(ok)).toEqual({ src: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', caption: 'Урок 1' })
		expect(video.schema.safeParse({ url: 'https://forms.yandex.ru/u/abc/', caption: null }).success).toBe(false)
		expect(video.schema.safeParse({ url: 'https://evil.ru/video.mp4', caption: null }).success).toBe(false)
		expect(video.toPublic(video.defaults())).toEqual({ src: null, caption: null }) // пустой черновик
	})

	it('встраивание — формы и видео из списка; высота в пределах', () => {
		const form = embed.schema.parse({ url: 'https://forms.yandex.ru/u/abc123/', height: 600, caption: null })
		expect(embed.toPublic(form)).toMatchObject({ src: 'https://forms.yandex.ru/u/abc123/?iframe=1', height: 600 })
		expect(embed.schema.safeParse({ ...form, url: 'https://forms.gle/abc' }).success).toBe(false)
		expect(embed.schema.safeParse({ ...form, url: 'javascript:alert(1)' }).success).toBe(false)
		expect(embed.schema.safeParse({ ...form, height: 5000 }).success).toBe(false)
	})
})

describe('код', () => {
	it('разметка в коде остаётся текстом — подсветка не вставляет HTML', () => {
		const html = renderToStaticMarkup(
			<CodeViewer data={{ language: 'html', code: '<img src=x onerror="alert(1)">' }} testId="c" />,
		)
		expect(html).not.toContain('<img')
		expect(html).toContain('&lt;')
		expect(html).toContain('hljs-tag') // подсветка есть
	})

	it('пустой код и пустой заголовок ученику не показываются', () => {
		expect(renderToStaticMarkup(<CodeViewer data={{ language: 'python', code: ' ' }} testId="c" />)).toBe('')
		expect(renderToStaticMarkup(<HeadingViewer data={{ level: 'h2', text: '' }} testId="h" />)).toBe('')
	})
})

describe('готовность к публикации (2.5)', () => {
	it('новые пустые блоки — с замечаниями; заполненные и разделитель — без', () => {
		expect(blockDataIssues(video, video.defaults())).toEqual(['noUrl'])
		expect(blockDataIssues(embed, embed.defaults())).toEqual(['noUrl'])
		expect(blockDataIssues(text, text.defaults())).toEqual(['empty'])
		expect(blockDataIssues(heading, { level: 'h2', text: '  ' })).toEqual(['empty'])
		expect(blockDataIssues(code, code.defaults())).toEqual(['empty'])
		expect(blockDataIssues(divider, {})).toEqual([])
		expect(blockDataIssues(video, { url: 'https://youtu.be/dQw4w9WgXcQ', caption: null })).toEqual([])
		expect(blockDataIssues(heading, { level: 'h3', text: 'Итоги' })).toEqual([])
	})
})
