import { Card, CardContent, CardHeader, CardTitle, Skeleton } from '@dinastia/ui'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { httpStatus } from '#/app/errors.ts'
import { currentHost } from '#/app/host.ts'
import { Centered } from '#/app/layout/centered.tsx'
import { meQuery, sessionQuery } from '#/app/queries.ts'
import { SignInForm } from '#/features/auth/sign-in-form.tsx'
import { MySchools } from '#/features/schools/my-schools.tsx'

export const Route = createFileRoute('/')({
	// В школе «/» ведёт по роли: ученик → /learn, сотрудники → /admin, не вошёл → /login.
	beforeLoad: async ({ context }) => {
		if (currentHost().kind !== 'school') return
		try {
			const me = await context.queryClient.ensureQueryData(meQuery())
			throw redirect({ to: me.member.role === 'student' ? '/learn' : '/admin' })
		} catch (error) {
			if (httpStatus(error) === 401) throw redirect({ to: '/login' })
			throw error
		}
	},
	component: RootHome,
})

/** Корневой домен: вход или список своих школ. */
function RootHome() {
	const { t } = useTranslation(['auth', 'common'])
	const qc = useQueryClient()
	const { data: session } = useSuspenseQuery(sessionQuery)
	return (
		<Centered>
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle>{session ? t('schools.title') : t('appName', { ns: 'common' })}</CardTitle>
				</CardHeader>
				<CardContent>
					{session ? (
						<Suspense fallback={<Skeleton className="h-24" />}>
							<MySchools />
						</Suspense>
					) : (
						<div className="grid gap-4">
							<SignInForm onSignedIn={() => qc.invalidateQueries()} />
							<p className="text-sm text-muted-foreground">
								{t('signIn.noAccount')}{' '}
								<Link to="/register" className="font-medium text-foreground underline-offset-4 hover:underline">
									{t('signIn.createSchool')}
								</Link>
							</p>
						</div>
					)}
				</CardContent>
			</Card>
		</Centered>
	)
}
