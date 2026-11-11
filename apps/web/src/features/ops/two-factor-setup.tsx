// Включение второго фактора оператором (5.6): пароль → QR и ключ для приложения → код → включено. Без этого консоль закрыта.
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input } from '@dinastia/ui'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { renderSVG } from 'uqr'
import { authClient } from '#/app/auth.ts'
import { orpc } from '#/app/orpc.ts'

export function TwoFactorSetup() {
	const { t } = useTranslation('ops')
	const qc = useQueryClient()
	const [password, setPassword] = useState('')
	const [setup, setSetup] = useState<{ uri: string; backupCodes: string[] }>()
	const [code, setCode] = useState('')
	const [error, setError] = useState<string>()
	const [pending, setPending] = useState(false)

	async function start(e: React.FormEvent) {
		e.preventDefault()
		setPending(true)
		setError(undefined)
		const res = await authClient.twoFactor.enable({ password })
		setPending(false)
		if (res.error || res.data?.method !== 'totp') return setError(t('twoFactor.passwordInvalid'))
		setSetup({ uri: res.data.totpURI, backupCodes: res.data.backupCodes })
	}

	async function verify(e: React.FormEvent) {
		e.preventDefault()
		setPending(true)
		setError(undefined)
		const res = await authClient.twoFactor.verifyTotp({ code: code.trim() })
		setPending(false)
		if (res.error) return setError(t('twoFactor.codeInvalid'))
		await qc.invalidateQueries({ queryKey: orpc.ops.me.key() })
	}

	const secret = setup ? (new URL(setup.uri).searchParams.get('secret') ?? '') : ''
	return (
		<Card className="mx-auto w-full max-w-md" data-testid="ops-2fa">
			<CardHeader>
				<CardTitle>{t('twoFactor.title')}</CardTitle>
				<CardDescription>{t('twoFactor.description')}</CardDescription>
			</CardHeader>
			<CardContent>
				{!setup ? (
					<form onSubmit={start} className="grid gap-4">
						<Field id="ops-2fa-password" label={t('twoFactor.password')}>
							<Input
								id="ops-2fa-password"
								type="password"
								autoComplete="current-password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								data-testid="ops-2fa-password"
							/>
						</Field>
						{error ? (
							<p role="alert" className="text-destructive text-sm">
								{error}
							</p>
						) : null}
						<Button type="submit" disabled={!password || pending} data-testid="ops-2fa-start">
							{t('twoFactor.start')}
						</Button>
					</form>
				) : (
					<form onSubmit={verify} className="grid gap-4">
						<p className="text-sm">{t('twoFactor.scan')}</p>
						<div
							className="mx-auto size-48 rounded-md bg-white p-2"
							// biome-ignore lint/security/noDangerouslySetInnerHtml: SVG собран uqr из ссылки otpauth, без данных пользователя
							dangerouslySetInnerHTML={{ __html: renderSVG(setup.uri) }}
						/>
						<p className="text-sm">
							{t('twoFactor.secret')}:{' '}
							<code className="break-all font-mono" data-testid="ops-2fa-secret">
								{secret}
							</code>
						</p>
						<div className="grid gap-1 text-sm">
							<p className="text-muted-foreground">{t('twoFactor.backupCodes')}</p>
							<code className="grid grid-cols-2 gap-1 font-mono">
								{setup.backupCodes.map((c) => (
									<span key={c}>{c}</span>
								))}
							</code>
						</div>
						<Field id="ops-2fa-code" label={t('twoFactor.code')}>
							<Input
								id="ops-2fa-code"
								inputMode="numeric"
								autoComplete="one-time-code"
								maxLength={6}
								value={code}
								onChange={(e) => setCode(e.target.value)}
								data-testid="ops-2fa-code"
							/>
						</Field>
						{error ? (
							<p role="alert" className="text-destructive text-sm">
								{error}
							</p>
						) : null}
						<Button type="submit" disabled={code.trim().length !== 6 || pending} data-testid="ops-2fa-verify">
							{t('twoFactor.verify')}
						</Button>
					</form>
				)}
			</CardContent>
		</Card>
	)
}
