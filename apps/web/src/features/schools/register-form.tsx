import { SchoolCreate } from '@dinastia/contracts/schools'
import { Alert, AlertDescription, Button, Field, Input } from '@dinastia/ui'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { authClient } from '#/app/auth.ts'
import { errorText } from '#/app/errors.ts'
import { client } from '#/app/orpc.ts'
import { sessionQuery } from '#/app/queries.ts'

/** Регистрация школы: аккаунт владельца (если не вошёл) + школа → переход в кабинет школы. */
export function RegisterSchoolForm() {
	const { t } = useTranslation('auth')
	const { data: session } = useQuery(sessionQuery)
	const [form, setForm] = useState({ name: '', email: '', password: '', schoolName: '', slug: '' })
	const [fieldErrors, setFieldErrors] = useState<Partial<Record<'name' | 'slug', string>>>({})
	const [error, setError] = useState<string>()
	const [pending, setPending] = useState(false)
	const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
		setForm({ ...form, [k]: e.target.value })

	async function submit(e: React.FormEvent) {
		e.preventDefault()
		setError(undefined)
		const parsed = SchoolCreate.safeParse({ name: form.schoolName, slug: form.slug })
		if (!parsed.success) {
			const errs: typeof fieldErrors = {}
			for (const issue of parsed.error.issues) {
				const key = issue.path[0] === 'name' ? 'name' : 'slug'
				errs[key] = t(errorText({ code: /^[A-Z_]+$/.test(issue.message) ? issue.message : 'INVALID_INPUT' }), {
					ns: 'errors',
				})
			}
			return setFieldErrors(errs)
		}
		setFieldErrors({})
		setPending(true)
		try {
			if (!session) {
				const res = await authClient.signUp.email({ email: form.email, password: form.password, name: form.name })
				if (res.error) return setError(t(errorText(res.error), { ns: 'errors' }))
			}
			const school = await client.schools.create(parsed.data)
			window.location.assign(`${school.url}/admin`)
		} catch (err) {
			setError(t(errorText(err), { ns: 'errors' }))
		} finally {
			setPending(false)
		}
	}

	return (
		<form onSubmit={submit} className="grid gap-4" noValidate data-testid="schools-register-form">
			{!session ? (
				<>
					<Field id="reg-name" label={t('register.name')}>
						<Input id="reg-name" autoComplete="name" required value={form.name} onChange={set('name')} />
					</Field>
					<Field id="reg-email" label={t('register.email')}>
						<Input
							id="reg-email"
							type="email"
							autoComplete="email"
							required
							value={form.email}
							onChange={set('email')}
						/>
					</Field>
					<Field id="reg-password" label={t('register.password')} hint={t('register.passwordHint')}>
						<Input
							id="reg-password"
							type="password"
							autoComplete="new-password"
							minLength={8}
							required
							value={form.password}
							onChange={set('password')}
						/>
					</Field>
				</>
			) : null}
			<Field id="reg-school" label={t('register.schoolName')} error={fieldErrors.name}>
				<Input id="reg-school" required value={form.schoolName} onChange={set('schoolName')} />
			</Field>
			<Field id="reg-slug" label={t('register.slug')} hint={t('register.slugHint')} error={fieldErrors.slug}>
				<div className="flex items-center gap-2">
					<Input
						id="reg-slug"
						required
						value={form.slug}
						onChange={set('slug')}
						className="max-w-48"
						aria-describedby="reg-slug-hint"
					/>
					<span className="text-sm text-muted-foreground">.{import.meta.env.VITE_APP_DOMAIN}</span>
				</div>
			</Field>
			<p className="text-xs text-muted-foreground">
				<Trans
					t={t}
					i18nKey="register.consent"
					components={{
						// biome-ignore lint/a11y/useAnchorContent: текст ссылки подставляет Trans
						offer: <a href="/legal/offer" target="_blank" rel="noopener noreferrer" className="underline" />,
						// biome-ignore lint/a11y/useAnchorContent: текст ссылки подставляет Trans
						privacy: <a href="/legal/privacy" target="_blank" rel="noopener noreferrer" className="underline" />,
					}}
				/>
			</p>
			{error ? (
				<Alert variant="destructive">
					<AlertDescription data-testid="schools-register-error">{error}</AlertDescription>
				</Alert>
			) : null}
			<Button type="submit" disabled={pending} data-testid="schools-register-submit">
				{t('register.submit')}
			</Button>
		</form>
	)
}
