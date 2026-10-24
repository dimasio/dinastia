import { Card, CardContent, CardHeader, CardTitle } from '@dinastia/ui'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { currentHost } from '#/app/host.ts'
import { Centered } from '#/app/layout/centered.tsx'
import { currentSchoolQuery } from '#/app/queries.ts'
import { SignInForm } from '#/features/auth/sign-in-form.tsx'

// Только относительные пути внутри приложения — без открытого редиректа на чужие сайты.
const Search = z.object({
	redirect: z
		.string()
		.regex(/^\/(?!\/)/)
		.optional()
		.catch(undefined),
})

export const Route = createFileRoute('/login')({
	validateSearch: Search,
	beforeLoad: ({ context }) => {
		if (currentHost().kind !== 'school') throw redirect({ to: '/' })
		return context.queryClient.ensureQueryData(currentSchoolQuery())
	},
	component: Login,
})

function Login() {
	const { t } = useTranslation('auth')
	const navigate = useNavigate()
	const { redirect: to } = Route.useSearch()
	const { data: school } = useSuspenseQuery(currentSchoolQuery())
	return (
		<Centered>
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle data-testid="login-title">{t('signIn.schoolTitle', { school: school.name })}</CardTitle>
				</CardHeader>
				<CardContent>
					<SignInForm callbackPath={to ?? '/'} onSignedIn={() => navigate({ to: to ?? '/' })} />
				</CardContent>
			</Card>
		</Centered>
	)
}
