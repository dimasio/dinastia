import { useTranslation } from 'react-i18next'
import type { BlockEditorProps } from '../types.ts'
import type { divider } from './definition.ts'

export default function DividerEditor({ testId }: BlockEditorProps<typeof divider>) {
	const { t } = useTranslation('blocks')
	return (
		<div className="flex items-center gap-3 text-muted-foreground text-xs" data-testid={`${testId}-line`}>
			<hr className="flex-1" />
			{t('divider.hint')}
			<hr className="flex-1" />
		</div>
	)
}
