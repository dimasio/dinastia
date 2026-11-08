// Очередь проверки (карточка 3.5): ресурс с фильтрами; названия курсов в подписи фильтра — из списка курсов школы.
import { ResourcePage, type ResourceSearch } from '@dinastia/ui/resource'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { orpc } from '#/app/orpc.ts'
import { reviewResource } from '../resources/review.tsx'

export function ReviewQueue(props: { search: ResourceSearch; onSearch: (s: ResourceSearch) => void }) {
	const { i18n } = useTranslation()
	const courses = useQuery(orpc.courses.list.queryOptions({ input: { pageSize: 100, sort: 'title', dir: 'asc' } }))
	const ids = courses.data?.items.map((c) => c.id) ?? []
	const key = ids.join('|')
	const resource = useMemo(() => {
		// подписи значений фильтра ищутся в строках `assessments:review.values.courseId.<id>` — кладём туда названия курсов
		for (const c of courses.data?.items ?? [])
			i18n.addResource(i18n.language, 'assessments', `review.values.courseId.${c.id}`, c.title)
		return reviewResource({ courses: ids })
	}, [key])
	return <ResourcePage resource={resource} search={props.search} onSearch={props.onSearch} />
}
