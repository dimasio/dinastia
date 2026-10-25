import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { meQuery } from '#/app/queries.ts'
import { ProfilePage } from '#/features/schools/profile-page.tsx'

export const Route = createFileRoute('/learn/profile')({
	component: () => {
		const { me } = Route.useRouteContext()
		const { data = me } = useQuery(meQuery())
		return <ProfilePage me={data} />
	},
})
