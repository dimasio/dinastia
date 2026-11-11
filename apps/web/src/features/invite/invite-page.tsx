import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@dinastia/ui'
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorText } from '#/app/errors.ts'
import { orpc } from '#/app/orpc.ts'
import { sessionQuery } from '#/app/queries.ts'
import { SignInForm } from '#/features/auth/sign-in-form.tsx'
import { PdConsent } from '#/features/legal/pd-consent.tsx'

export function InvitePage({ token }: { token: string }) {
	const { t } = useTranslation(['auth', 'common', 'errors'])
	const qc = useQueryClient()
	const navigate = useNavigate()
	const { data: inv } = useSuspenseQuery(orpc.invitations.get.queryOptions({ input: { token }, retry: false }))
	const { data: session } = useQuery(sessionQuery)
	const [consent, setConsent] = useState(false)
	const accept = useMutation(
		orpc.invitations.accept.mutationOptions({
			onSuccess: async () => {
				await qc.invalidateQueries()
				await navigate({ to: '/' })
			},
		}),
	)
	const role = t(`roles.${inv.role}`, { ns: 'common' })

	return (
		<Card className="w-full max-w-md" data-testid="invite-card">
			<CardHeader>
				<CardTitle>{t('invite.title', { school: inv.school.name })}</CardTitle>
				<CardDescription>{t('invite.description', { role, email: inv.email })}</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-4">
				{session ? (
					<>
						<PdConsent legal={inv.legal} checked={consent} onChange={setConsent} />
						<Button
							onClick={() => accept.mutate({ token, consent: true })}
							disabled={!consent || accept.isPending}
							data-testid="invite-accept"
						>
							{t('invite.accept')}
						</Button>
						{accept.error ? (
							<p role="alert" className="text-sm text-destructive">
								{t(errorText(accept.error), { ns: 'errors' })}
							</p>
						) : null}
					</>
				) : (
					<>
						<p className="text-sm text-muted-foreground">{t('invite.signInToAccept')}</p>
						<SignInForm
							initialMode="link"
							defaultEmail={inv.email}
							callbackPath={`/invite/${token}`}
							onSignedIn={() => qc.invalidateQueries()}
						/>
					</>
				)}
			</CardContent>
		</Card>
	)
}
