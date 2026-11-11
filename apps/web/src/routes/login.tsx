import { Card, CardContent, CardHeader, CardTitle } from '@dinastia/ui'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { currentHost } from '#/app/host.ts'
import { Centered } from '#/app/layout/centered.tsx'
import { currentSchoolQuery } from '#/app/queries.ts'
import { searchString } from '#/app/search.ts'
import { SignInForm } from '#/features/auth/sign-in-form.tsx'

// Только относительные пути внутри приложения — без открытого редиректа на чужие сайты.
const Search = (s: Record<string, unknown>): { redirect?: string | undefined } => ({
	redirect: searchString(s.redirect, 2000, /^\/(?!\/)/),
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
