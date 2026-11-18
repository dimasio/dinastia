// Видео в хранилище файлов школы (D-070): без сервиса видео — для демо-стенда и пакета для Windows. Загрузка — обычный
// файл школы по presigned URL, просмотр — подписанная ссылка и встроенный плеер браузера (без адаптивного потока).
// Загрузку и статус ведёт модуль, которому нужна БД (courses/video.service.ts); сетевых методов у провайдера нет.
import type { VideoProvider } from './provider.ts'

const notHere = () =>
	Promise.reject(new Error('VIDEO_PROVIDER=storage: загрузку и статус ведёт сервис модуля по ctx.files'))

export const storageVideo: VideoProvider = {
	key: 'storage',
	createUpload: notHere,
	getStatus: notHere,
}
