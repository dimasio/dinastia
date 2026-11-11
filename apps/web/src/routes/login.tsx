import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@dinastia/ui'
import type { ORPCError } from '@orpc/client'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { errorCode } from '#/app/errors.ts'
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
	beforeLoad: async ({ context }) => {
		if (currentHost().kind !== 'school') throw redirect({ to: '/' })
		// приостановленная школа (5.6в): вход остаётся — владелец должен войти; название — из данных ошибки
		await context.queryClient.ensureQueryData(currentSchoolQuery()).catch((e) => {
			if (errorCode(e) !== 'SCHOOL_SUSPENDED') throw e
		})
	},
	component: Login,
})

function Login() {
	const { t } = useTranslation('auth')
	const navigate = useNavigate()
	const { redirect: to } = Route.useSearch()
	const { data: school, error } = useQuery(currentSchoolQuery())
	const suspendedName =
		errorCode(error) === 'SCHOOL_SUSPENDED'
			? ((error as ORPCError<string, { schoolName?: string }>).data?.schoolName ?? '')
			: null
	if (!school && suspendedName === null) return null
	return (
		<Centered>
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle data-testid="login-title">
						{suspendedName !== null
							? t('signIn.suspendedTitle', { school: suspendedName })
							: t('signIn.schoolTitle', { school: school?.name })}
					</CardTitle>
					{suspendedName !== null ? <CardDescription>{t('signIn.suspendedHint')}</CardDescription> : null}
				</CardHeader>
				<CardContent>
					<SignInForm callbackPath={to ?? '/'} onSignedIn={() => navigate({ to: to ?? '/' })} />
				</CardContent>
			</Card>
		</Centered>
	)
}
