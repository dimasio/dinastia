// Песочница блоков (пункт 1.3): палитра реестра → черновик в BlockEditorHost → «публикация» (toPublic) →
// BlockViewerHost. Состояние — в памяти страницы; хранение и публикацию на сервере проверяют тесты ядра
// (kernel/blocks). Только в режиме разработки; конструктор урока — пункт 2.3.
import { createFileRoute, notFound } from '@tanstack/react-router'
import { Sandbox } from '#/features/dev/blocks-sandbox.tsx'

export const Route = createFileRoute('/dev/blocks')({
	beforeLoad: () => {
		if (!import.meta.env.DEV) throw notFound()
	},
	component: Sandbox,
})
