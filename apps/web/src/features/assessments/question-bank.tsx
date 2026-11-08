// Банк вопросов курса (карточка 3.1): вкладки курса, таблица ресурса, диалог «Теги курса».
import type { CourseTag } from '@dinastia/contracts/assessments'
import { Button, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, toast } from '@dinastia/ui'
import { ResourcePage, type ResourceSearch } from '@dinastia/ui/resource'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Tags } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorText } from '#/app/errors.ts'
import { orpc } from '#/app/orpc.ts'
import { meQuery } from '#/app/queries.ts'
import { CourseTabs } from '../courses/course-tabs.tsx'
import { questionsResource } from './resources/questions.tsx'
import { TagsEditor } from './tags-editor.tsx'

export function QuestionBank(props: {
	courseId: string
	search: ResourceSearch
	onSearch: (s: ResourceSearch) => void
}) {
	const { courseId } = props
	const { t } = useTranslation('assessments')
	const navigate = useNavigate()
	const [tagsOpen, setTagsOpen] = useState(false)
	const tags = useQuery(orpc.assessments.tags.list.queryOptions({ input: { courseId } }))
	const names = tags.data?.map((x) => x.name).join('|') ?? ''
	// фильтр по тегу строится по тегам курса; ресурс пересоздаётся только при их смене
	const resource = useMemo(
		() =>
			questionsResource({
				courseId,
				tags: tags.data?.filter((x) => x.count > 0).map((x) => x.name) ?? [],
				onCreate: (type) =>
					navigate({
						to: '/admin/courses/$courseId/questions/$questionId',
						params: { courseId, questionId: 'new' },
						search: { type },
					}),
			}),
		[courseId, names, tags.data, navigate],
	)
	return (
		<div className="grid gap-4">
			<CourseTabs
				courseId={courseId}
				active="questions"
				actions={
					<Button variant="outline" size="sm" onClick={() => setTagsOpen(true)} data-testid="bank-tags">
						<Tags />
						{t('tags.open')}
					</Button>
				}
			/>
			<ResourcePage resource={resource} search={props.search} onSearch={props.onSearch} />
			<TagsSheet courseId={courseId} open={tagsOpen} onOpenChange={setTagsOpen} tags={tags.data ?? []} />
		</div>
	)
}

function TagsSheet(props: { courseId: string; open: boolean; onOpenChange: (o: boolean) => void; tags: CourseTag[] }) {
	const { t } = useTranslation(['assessments', 'errors'])
	const qc = useQueryClient()
	const { data: me } = useQuery(meQuery())
	const canManage = me?.permissions.includes('assessments.bank.manage') ?? false
	const refresh = () =>
		qc.invalidateQueries({ queryKey: ['resource', 'questions'] }).then(() =>
			qc.invalidateQueries({
				queryKey: orpc.assessments.tags.list.queryOptions({ input: { courseId: props.courseId } }).queryKey,
			}),
		)
	const rename = useMutation({
		...orpc.assessments.tags.rename.mutationOptions(),
		onSuccess: () => refresh(),
		onError: (e) => toast.error(t(errorText(e), { ns: 'errors' })),
	})
	const remove = useMutation({
		...orpc.assessments.tags.remove.mutationOptions(),
		onSuccess: () => refresh(),
		onError: (e) => toast.error(t(errorText(e), { ns: 'errors' })),
	})
	return (
		<Sheet open={props.open} onOpenChange={props.onOpenChange}>
			<SheetContent className="w-full overflow-y-auto sm:max-w-md">
				<SheetHeader>
					<SheetTitle>{t('tags.title')}</SheetTitle>
					<SheetDescription>{t('tags.description')}</SheetDescription>
				</SheetHeader>
				<div className="px-4 pb-4">
					<TagsEditor
						tags={props.tags}
						canManage={canManage}
						onRename={(id, name) => rename.mutateAsync({ id, name })}
						onRemove={(id) => remove.mutateAsync({ id })}
					/>
				</div>
			</SheetContent>
		</Sheet>
	)
}
