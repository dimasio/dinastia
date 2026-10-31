// Палитра блоков конструктора: типы из реестра по категориям, подписи — blocks:<type>.title|description.
import { Button } from '@dinastia/ui'
import { useTranslation } from 'react-i18next'
import { BLOCK_CATEGORIES } from '../define.ts'
import { clientBlocks } from '../registry.client.ts'
import { type BlockType, blocks } from '../registry.ts'

export function BlockPalette({
	onPick,
	testId = 'block-palette',
}: {
	onPick: (type: BlockType) => void
	testId?: string
}) {
	const { t } = useTranslation('blocks')
	const types = Object.values(blocks)
	return (
		<nav aria-label={t('palette.title')} className="grid content-start gap-4" data-testid={testId}>
			{BLOCK_CATEGORIES.map((category) => {
				const inCategory = types.filter((b) => b.category === category)
				if (!inCategory.length) return null
				return (
					<section key={category} className="grid content-start gap-2">
						<h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
							{t(`categories.${category}`)}
						</h3>
						<div className="grid gap-2">
							{inCategory.map((b) => {
								const type = b.type as BlockType
								const Icon = clientBlocks[type].icon
								return (
									<Button
										key={type}
										type="button"
										variant="outline"
										className="h-auto justify-start gap-3 whitespace-normal py-3 text-start"
										onClick={() => onPick(type)}
										data-testid={`${testId}-${type}`}
									>
										<Icon className="size-5 shrink-0" aria-hidden />
										<span className="grid justify-items-start gap-0.5 text-start">
											<span className="font-medium">{t(`${type}.title`)}</span>
											<span className="font-normal text-muted-foreground text-xs">{t(`${type}.description`)}</span>
										</span>
									</Button>
								)
							})}
						</div>
					</section>
				)
			})}
		</nav>
	)
}
