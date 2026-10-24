import { Button, Field, Input } from '@dinastia/ui'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { authClient } from '#/app/auth.ts'
import { errorText } from '#/app/errors.ts'

/** Вход по паролю или по ссылке из письма. После входа — onSignedIn (обновить сессию, перейти дальше). */
export function SignInForm({
	initialMode = 'password',
	onSignedIn,
	callbackPath = '/',
	defaultEmail = '',
}: {
	onSignedIn: () => void
	callbackPath?: string
	defaultEmail?: string
	/** Режим по умолчанию: на странице приглашения — ссылка (у нового человека нет пароля). */
	initialMode?: 'password' | 'link'
}) {
	const { t } = useTranslation('auth')
	const qc = useQueryClient()
	const [mode, setMode] = useState<'password' | 'link'>(initialMode)
	const [email, setEmail] = useState(defaultEmail)
	const [password, setPassword] = useState('')
	const [error, setError] = useState<string>()
	const [sentTo, setSentTo] = useState<string>()
	const [pending, setPending] = useState(false)

	async function submit(e: React.FormEvent) {
		e.preventDefault()
		setError(undefined)
		setPending(true)
		try {
			if (mode === 'password') {
				const res = await authClient.signIn.email({ email, password })
				if (res.error) return setError(t(errorText(res.error), { ns: 'errors' }))
				await qc.invalidateQueries()
				onSignedIn()
			} else {
				const res = await authClient.signIn.magicLink({ email, callbackURL: callbackPath })
				if (res.error) return setError(t(errorText(res.error), { ns: 'errors' }))
				setSentTo(email)
			}
		} catch (err) {
			setError(t(errorText(err), { ns: 'errors' }))
		} finally {
			setPending(false)
		}
	}

	if (sentTo) return <p data-testid="auth-link-sent">{t('signIn.linkSent', { email: sentTo })}</p>

	return (
		<form onSubmit={submit} className="grid gap-4" noValidate>
			<Field id="signin-email" label={t('signIn.email')}>
				<Input
					id="signin-email"
					type="email"
					autoComplete="email"
					required
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					data-testid="auth-signin-email"
				/>
			</Field>
			{mode === 'password' ? (
				<Field id="signin-password" label={t('signIn.password')}>
					<Input
						id="signin-password"
						type="password"
						autoComplete="current-password"
						required
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						data-testid="auth-signin-password"
					/>
				</Field>
			) : null}
			{error ? (
				<p role="alert" className="text-sm text-destructive" data-testid="auth-signin-error">
					{error}
				</p>
			) : null}
			<Button type="submit" disabled={pending} data-testid="auth-signin-submit">
				{mode === 'password' ? t('signIn.submit') : t('signIn.sendLink')}
			</Button>
			<Button
				type="button"
				variant="link"
				className="px-0"
				onClick={() => setMode(mode === 'password' ? 'link' : 'password')}
			>
				{mode === 'password' ? t('signIn.withLink') : t('signIn.withPassword')}
			</Button>
		</form>
	)
}
