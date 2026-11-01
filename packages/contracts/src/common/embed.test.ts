import { describe, expect, it } from 'vitest'
import { embedService, embedSrc, isVideoUrl } from './embed.ts'

describe('белый список встраиваний', () => {
	it.each([
		['https://www.youtube.com/embed/dQw4w9WgXcQ', 'youtube'],
		['https://youtu.be/dQw4w9WgXcQ', 'youtube'],
		['https://www.youtube-nocookie.com/embed/x', 'youtube'],
		['https://rutube.ru/play/embed/abc', 'rutube'],
		['https://vkvideo.ru/video-1_2', 'vk-video'],
		['https://vk.com/video_ext.php?oid=-1&id=2', 'vk-video'],
		['https://kinescope.io/embed/123', 'kinescope'],
		['https://player.vimeo.com/video/1', 'vimeo'],
		['https://forms.yandex.ru/u/abc/', 'yandex-forms'],
		['https://docs.google.com/forms/d/e/x/viewform', 'google-forms'],
		['https://forms.gle/abc', 'google-forms'],
	])('%s → %s', (url, service) => {
		expect(embedService(url)).toBe(service)
	})

	it.each([
		'http://www.youtube.com/embed/x', // не https
		'https://youtube.com.evil.ru/embed/x', // чужой домен с похожим началом
		'https://evilyoutube.com/embed/x',
		'https://docs.google.com/document/d/x', // Google — только формы
		'https://vk.com/id1', // VK — только видео
		'https://user:pass@www.youtube.com/embed/x',
		'https://www.youtube.com:8443/embed/x',
		'javascript:alert(1)',
		'не ссылка',
	])('%s — нельзя', (url) => {
		expect(embedService(url)).toBeNull()
	})
})

describe('адрес плеера по ссылке', () => {
	it.each([
		['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'],
		['https://youtu.be/dQw4w9WgXcQ', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'],
		['https://youtube.com/shorts/dQw4w9WgXcQ', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'],
		['https://rutube.ru/video/0123abcd/', 'https://rutube.ru/play/embed/0123abcd'],
		['https://rutube.ru/play/embed/0123abcd', 'https://rutube.ru/play/embed/0123abcd'],
		['https://vkvideo.ru/video-12_34', 'https://vkvideo.ru/video_ext.php?oid=-12&id=34'],
		['https://vk.com/video_ext.php?oid=-1&id=2&hash=ab12', 'https://vkvideo.ru/video_ext.php?oid=-1&id=2&hash=ab12'],
		['https://kinescope.io/abc-123', 'https://kinescope.io/embed/abc-123'],
		['https://vimeo.com/76979871', 'https://player.vimeo.com/video/76979871'],
		['https://forms.yandex.ru/u/abc123/', 'https://forms.yandex.ru/u/abc123/?iframe=1'],
		[
			'https://docs.google.com/forms/d/e/1FAIp/viewform',
			'https://docs.google.com/forms/d/e/1FAIp/viewform?embedded=true',
		],
	])('%s → %s', (url, src) => {
		expect(embedSrc(url)).toBe(src)
	})

	it.each([
		'https://www.youtube.com/watch?v=<script>',
		'https://www.youtube.com/channel/x',
		'https://forms.gle/abc', // переадресация — нужна полная ссылка
		'https://vk.com/video/@club', // не ролик
		'https://evil.ru/embed/x',
	])('%s — не разобрать', (url) => {
		expect(embedSrc(url)).toBeNull()
	})

	it('блок «Видео» — только видеосервисы', () => {
		expect(isVideoUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(true)
		expect(isVideoUrl('https://forms.yandex.ru/u/abc123/')).toBe(false)
	})
})
