// Песочница rich text (пункт 1.12): форма ресурса с полем RichText, просмотр и проверка профиля — для e2e и ручной
// проверки. Только в режиме разработки; в production — 404 (продуктового экрана с rich text до фазы 2 нет).
import { createFileRoute, notFound } from '@tanstack/react-router'
import { Sandbox } from '#/features/dev/rich-text-sandbox.tsx'

export const Route = createFileRoute('/dev/rich-text')({
	beforeLoad: () => {
		if (!import.meta.env.DEV) throw notFound()
	},
	component: Sandbox,
})
