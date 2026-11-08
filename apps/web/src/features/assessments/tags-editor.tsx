// Список тегов курса: переименование по месту и удаление в два шага (без диалога подтверждения).
import type { CourseTag } from '@dinastia/contracts/assessments'
import { Button, Input } from '@dinastia/ui'
import { Check, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

export function TagsEditor(props: {
	tags: CourseTag[]
	canManage: boolean
	onRename: (id: string, name: string) => Promise<unknown>
	onRemove: (id: string) => Promise<unknown>
}) {
	const { t } = useTranslation('assessments')
	if (props.tags.length === 0) return <p className="text-muted-foreground text-sm">{t('tags.empty')}</p>
	return (
		<ul className="grid gap-2" data-testid="tags-list">
			{props.tags.map((tag) => (
				<TagRow key={`${tag.id}:${tag.name}`} tag={tag} {...props} />
			))}
		</ul>
	)
}

function TagRow({ tag, canManage, onRename, onRemove }: { tag: CourseTag } & Parameters<typeof TagsEditor>[0]) {
	const { t } = useTranslation('assessments')
	const [name, setName] = useState(tag.name)
	const [confirm, setConfirm] = useState(false)
	const changed = name.trim() !== '' && name.trim() !== tag.name
	return (
		<li className="flex items-center gap-2" data-testid="tag-row">
			<Input
				value={name}
				maxLength={40}
				disabled={!canManage}
				aria-label={t('tags.name')}
				onChange={(e) => setName(e.target.value)}
				onKeyDown={(e) => e.key === 'Enter' && changed && onRename(tag.id, name)}
				className="min-w-0 flex-1"
				data-testid="tag-name"
			/>
			<span className="w-8 shrink-0 text-right text-muted-foreground text-sm" title={t('tags.count')}>
				{tag.count}
			</span>
			{canManage && changed && (
				<Button
					size="icon"
					variant="outline"
					aria-label={t('tags.save')}
					onClick={() => onRename(tag.id, name)}
					data-testid="tag-save"
				>
					<Check />
				</Button>
			)}
			{canManage &&
				(confirm ? (
					<Button size="sm" variant="destructive" onClick={() => onRemove(tag.id)} data-testid="tag-remove-confirm">
						{t('tags.removeConfirm')}
					</Button>
				) : (
					<Button
						size="icon"
						variant="ghost"
						aria-label={t('tags.remove')}
						onClick={() => setConfirm(true)}
						data-testid="tag-remove"
					>
						<Trash2 />
					</Button>
				))}
		</li>
	)
}
