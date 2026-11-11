// Вкладка «Ученики» курса (карточка 4.1): таблица ресурса и срок доступа по умолчанию.
import { Button, Input, Label, toast } from '@dinastia/ui'
import { ResourcePage, type ResourceSearch } from '@dinastia/ui/resource'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorText } from '#/app/errors.ts'
import { orpc } from '#/app/orpc.ts'
import { meQuery } from '#/app/queries.ts'
import { CourseTabs } from '../courses/course-tabs.tsx'
import { InvitesSheet } from './invites-sheet.tsx'
import { enrollmentsResource } from './resources/enrollments.tsx'

export function Learners(props: { courseId: string; search: ResourceSearch; onSearch: (s: ResourceSearch) => void }) {
	const { courseId } = props
	const groups = useQuery(orpc.learning.groups.list.queryOptions({ input: { courseId } }))
	const resource = useMemo(() => enrollmentsResource({ courseId, groups: groups.data ?? [] }), [courseId, groups.data])
	const { t } = useTranslation('learning')
	const { data: me } = useQuery(meQuery())
	const [invitesOpen, setInvitesOpen] = useState(false)
	const canEnroll = me?.permissions.includes('learning.enroll') ?? false
	return (
		<div className="grid grid-cols-[minmax(0,1fr)] gap-4">
			<CourseTabs
				courseId={courseId}
				active="learners"
				actions={
					canEnroll ? (
						<Button variant="outline" size="sm" onClick={() => setInvitesOpen(true)} data-testid="invites-open">
							<Link2 />
							{t('invites.open')}
						</Button>
					) : undefined
				}
			/>
			{canEnroll && <InvitesSheet courseId={courseId} open={invitesOpen} onOpenChange={setInvitesOpen} />}
			<DefaultDays courseId={courseId} />
			<ResourcePage resource={resource} search={props.search} onSearch={props.onSearch} />
		</div>
	)
}

/** Срок доступа по умолчанию (`courses.accessDays`) — для новых зачислений. */
function DefaultDays({ courseId }: { courseId: string }) {
	const { t } = useTranslation(['learning', 'errors'])
	const qc = useQueryClient()
	const { data: me } = useQuery(meQuery())
	const canEdit = me?.permissions.includes('courses.manage') ?? false
	const course = useQuery(orpc.courses.get.queryOptions({ input: { id: courseId } }))
	const [value, setValue] = useState('')
	useEffect(() => {
		if (course.data) setValue(course.data.accessDays ? String(course.data.accessDays) : '')
	}, [course.data])
	const save = useMutation({
		...orpc.courses.update.mutationOptions(),
		onSuccess: () => {
			toast.success(t('learning:enrollments.defaultDays.saved'))
			qc.invalidateQueries({ queryKey: orpc.courses.get.queryOptions({ input: { id: courseId } }).queryKey })
		},
		onError: (e) => toast.error(t(errorText(e), { ns: 'errors' })),
	})
	if (!canEdit) return null
	const days = value.trim() === '' ? null : Number(value)
	const invalid = days !== null && !(Number.isInteger(days) && days >= 1 && days <= 3650)
	return (
		<form
			className="flex flex-wrap items-end gap-2"
			onSubmit={(e) => {
				e.preventDefault()
				if (!invalid) save.mutate({ id: courseId, accessDays: days })
			}}
		>
			<div className="grid gap-1">
				<Label htmlFor="default-days">{t('learning:enrollments.defaultDays.label')}</Label>
				<Input
					id="default-days"
					inputMode="numeric"
					className="w-40"
					value={value}
					onChange={(e) => setValue(e.target.value)}
					aria-invalid={invalid}
					data-testid="default-days"
				/>
			</div>
			<Button type="submit" variant="outline" disabled={invalid || save.isPending} data-testid="default-days-save">
				{t('learning:enrollments.defaultDays.save')}
			</Button>
			<p className="basis-full text-muted-foreground text-xs">{t('learning:enrollments.defaultDays.hint')}</p>
		</form>
	)
}
