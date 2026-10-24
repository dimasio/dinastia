import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@dinastia/ui'
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { currentHost, hostUrl } from '#/app/host.ts'
import { Centered } from '#/app/layout/centered.tsx'
import { RegisterSchoolForm } from '#/features/schools/register-form.tsx'

export const Route = createFileRoute('/register')({
	beforeLoad: () => {
		// Школу создают только на корневом домене.
		if (currentHost().kind !== 'root') throw redirect({ href: hostUrl(undefined, '/register') })
	},
	component: Register,
})

function Register() {
	const { t } = useTranslation('auth')
	return (
		<Centered>
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle>{t('register.title')}</CardTitle>
					<CardDescription>{t('register.description')}</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-4">
					<RegisterSchoolForm />
					<p className="text-sm text-muted-foreground">
						{t('register.haveAccount')}{' '}
						<Link to="/" className="font-medium text-foreground underline-offset-4 hover:underline">
							{t('register.signIn')}
						</Link>
					</p>
				</CardContent>
			</Card>
		</Centered>
	)
}
