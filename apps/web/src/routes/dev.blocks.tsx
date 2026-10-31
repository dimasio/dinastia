// Песочница блоков (пункт 1.3): палитра реестра → черновик в BlockEditorHost → «публикация» (toPublic) →
// BlockViewerHost. Состояние — в памяти страницы; хранение и публикацию на сервере проверяют тесты ядра
// (kernel/blocks). Только в режиме разработки; конструктор урока — пункт 2.3.
import { blockDef } from '@dinastia/blocks'
import { BlockEditorHost, BlockPalette, BlockViewerHost } from '@dinastia/blocks/client'
import { Button, Card, CardContent, EmptyState, PageHeader } from '@dinastia/ui'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { LayoutList, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

export const Route = createFileRoute('/dev/blocks')({
	beforeLoad: () => {
		if (!import.meta.env.DEV) throw notFound()
	},
	component: Sandbox,
})

interface DraftBlock {
	key: string
	type: string
	data: unknown
}

function Sandbox() {
	const { t } = useTranslation()
	const [draft, setDraft] = useState<DraftBlock[]>([])
	const [published, setPublished] = useState<{ key: string; type: string; data: unknown }[]>([])

	return (
		<main className="mx-auto grid max-w-5xl gap-6 p-4 sm:p-8">
			<PageHeader title={t('devBlocks.title')} description={t('devBlocks.description')} />
			<div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
				<BlockPalette
					onPick={(type) =>
						setDraft((d) => [...d, { key: crypto.randomUUID(), type, data: blockDef(type)?.defaults() }])
					}
				/>
				<section className="grid content-start gap-4" aria-label={t('devBlocks.draft')}>
					<div className="flex items-center justify-between gap-2">
						<h2 className="font-semibold">{t('devBlocks.draft')}</h2>
						<Button
							type="button"
							disabled={!draft.length}
							data-testid="sandbox-publish"
							onClick={() =>
								setPublished(
									draft.map((b) => ({
										key: b.key,
										type: b.type,
										data: blockDef(b.type)?.toPublic(blockDef(b.type)?.schema.parse(b.data)),
									})),
								)
							}
						>
							{t('devBlocks.publish')}
						</Button>
					</div>
					{draft.length === 0 && <EmptyState icon={LayoutList} title={t('devBlocks.empty')} />}
					{draft.map((b, i) => (
						<Card key={b.key}>
							<CardContent className="grid gap-2">
								<div className="flex justify-end">
									<Button
										type="button"
										variant="ghost"
										size="icon-sm"
										aria-label={t('devBlocks.remove')}
										onClick={() => setDraft((d) => d.filter((x) => x.key !== b.key))}
									>
										<Trash2 />
									</Button>
								</div>
								<BlockEditorHost
									type={b.type}
									value={b.data}
									delayMs={100}
									testId={`draft-${i}`}
									onChange={(data) => setDraft((d) => d.map((x) => (x.key === b.key ? { ...x, data } : x)))}
								/>
							</CardContent>
						</Card>
					))}
				</section>
			</div>
			{published.length > 0 && (
				<section className="grid gap-3" aria-label={t('devBlocks.published')} data-testid="sandbox-published">
					<h2 className="font-semibold">{t('devBlocks.published')}</h2>
					{published.map((b, i) => (
						<BlockViewerHost key={b.key} type={b.type} data={b.data} testId={`published-${i}`} />
					))}
				</section>
			)}
		</main>
	)
}
