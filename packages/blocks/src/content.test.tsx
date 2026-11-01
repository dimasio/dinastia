// Блоки контента (карточка 2.4): ссылки видео и встраиваний — только белый список, ученику — адрес плеера; код
// подсвечивается без HTML на странице (скилл security-baseline).
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { code } from './code/definition.ts'
import CodeViewer from './code/viewer.tsx'
import { blockDataIssues, blockFileIds } from './define.ts'
import { divider } from './divider/definition.ts'
import { embed } from './embed/definition.ts'
import { file } from './file/definition.ts'
import FileViewer from './file/viewer.tsx'
import { heading } from './heading/definition.ts'
import HeadingViewer from './heading/viewer.tsx'
import { image } from './image/definition.ts'
import ImageViewer from './image/viewer.tsx'
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
			<CodeViewer data={{ language: 'html', code: '<img src=x onerror="alert(1)">' }} testId="c" files={{}} />,
		)
		expect(html).not.toContain('<img')
		expect(html).toContain('&lt;')
		expect(html).toContain('hljs-tag') // подсветка есть
	})

	it('пустой код и пустой заголовок ученику не показываются', () => {
		expect(renderToStaticMarkup(<CodeViewer data={{ language: 'python', code: ' ' }} testId="c" files={{}} />)).toBe('')
		expect(renderToStaticMarkup(<HeadingViewer data={{ level: 'h2', text: '' }} testId="h" files={{}} />)).toBe('')
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

describe('картинка и файл (2.7)', () => {
	const id = '01900000-0000-7000-8000-000000000001'
	const f = { url: 'https://s3.local/signed', name: 'Конспект.pdf', mime: 'application/pdf', size: 2 * 1024 * 1024 }

	it('блок называет свои файлы ядру; без файла — замечание; текст — картинки документа', () => {
		expect(blockFileIds(image, { fileId: id, alt: null, caption: null })).toEqual([id])
		expect(blockFileIds(image, image.defaults())).toEqual([])
		expect(blockDataIssues(image, image.defaults())).toEqual(['noFile'])
		expect(blockDataIssues(file, { fileId: id, title: null })).toEqual([])
		const body = { type: 'doc' as const, content: [{ type: 'image', attrs: { fileId: id, alt: null } }] }
		expect(blockFileIds(text, { body })).toEqual([id])
	})

	it('просмотр берёт адрес из файлов блока; нет ссылки — ничего', () => {
		const img = renderToStaticMarkup(
			<ImageViewer
				data={{ fileId: id, alt: 'Схема', caption: 'Рис. 1' }}
				files={{ [id]: { ...f, mime: 'image/png' } }}
				testId="i"
			/>,
		)
		expect(img).toContain('src="https://s3.local/signed"')
		expect(img).toContain('alt="Схема"')
		expect(renderToStaticMarkup(<ImageViewer data={{ fileId: id }} files={{}} testId="i" />)).toBe('')
		const card = renderToStaticMarkup(<FileViewer data={{ fileId: id, title: null }} files={{ [id]: f }} testId="f" />)
		expect(card).toContain('Конспект.pdf')
		expect(card).toContain('PDF · media.size.mb') // строки в тестах пакета — ключами
	})
})
