import { describe, expect, it } from 'vitest'
import { embedService } from './embed-allowlist.ts'

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
