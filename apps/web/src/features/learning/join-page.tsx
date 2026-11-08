// Страница /join/<токен> (карточка 4.1(б)): сведения о приглашении на курс, вход по ссылке на почту, «Присоединиться».
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from '@dinastia/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { errorText } from '#/app/errors.ts'
import { orpc } from '#/app/orpc.ts'
import { sessionQuery } from '#/app/queries.ts'
import { SignInForm } from '#/features/auth/sign-in-form.tsx'

export function JoinPage({ token }: { token: string }) {
	const { t } = useTranslation(['learning', 'errors'])
	const qc = useQueryClient()
	const navigate = useNavigate()
	const joinQuery = useQuery(orpc.join.get.queryOptions({ input: { token }, retry: false }))
	const { data: session } = useQuery(sessionQuery)
	const accept = useMutation(
		orpc.join.accept.mutationOptions({
			onSuccess: async (res) => {
				await qc.invalidateQueries()
				await navigate({ to: '/learn/courses/$courseId', params: { courseId: res.courseId } })
			},
		}),
	)
	if (joinQuery.isPending) return <Skeleton className="h-48 w-full max-w-md" />
	if (joinQuery.error)
		return (
			<Card className="w-full max-w-md" data-testid="join-card">
				<CardHeader>
					<CardTitle>{t('learning:join.unavailable')}</CardTitle>
					<CardDescription data-testid="join-error">{t(errorText(joinQuery.error), { ns: 'errors' })}</CardDescription>
				</CardHeader>
			</Card>
		)
	const join = joinQuery.data
	return (
		<Card className="w-full max-w-md" data-testid="join-card">
			<CardHeader>
				<CardTitle>{t('learning:join.title', { course: join.courseTitle })}</CardTitle>
				<CardDescription>
					{join.email
						? t('learning:join.descriptionEmail', { school: join.school.name, email: join.email })
						: t('learning:join.description', { school: join.school.name })}
				</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-4">
				{session ? (
					<>
						<Button onClick={() => accept.mutate({ token })} disabled={accept.isPending} data-testid="join-accept">
							{t('learning:join.accept')}
						</Button>
						{accept.error ? (
							<p role="alert" className="text-destructive text-sm" data-testid="join-error">
								{t(errorText(accept.error), { ns: 'errors' })}
							</p>
						) : null}
					</>
				) : (
					<>
						<p className="text-muted-foreground text-sm">{t('learning:join.signIn')}</p>
						<SignInForm
							initialMode="link"
							defaultEmail={join.email ?? ''}
							callbackPath={`/join/${token}`}
							onSignedIn={() => qc.invalidateQueries()}
						/>
					</>
				)}
			</CardContent>
		</Card>
	)
}
