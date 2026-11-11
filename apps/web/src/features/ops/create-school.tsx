// Создание школы оператором (5.6): школа + письмо-приглашение владельцу. Регистрации школ вне консоли нет.
import {
	Alert,
	AlertDescription,
	Button,
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
	Field,
	Input,
} from '@dinastia/ui'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorText } from '#/app/errors.ts'
import { orpc } from '#/app/orpc.ts'

export function CreateSchool() {
	const { t } = useTranslation(['ops', 'errors'])
	const [form, setForm] = useState({ name: '', slug: '', ownerEmail: '' })
	const create = useMutation(orpc.ops.schools.create.mutationOptions())
	const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
		setForm((f) => ({ ...f, [k]: e.target.value }))
	return (
		<Card data-testid="ops-create-school">
			<CardHeader>
				<CardTitle>{t('create.title')}</CardTitle>
				<CardDescription>{t('create.description')}</CardDescription>
			</CardHeader>
			<CardContent>
				<form
					className="grid gap-4"
					onSubmit={(e) => {
						e.preventDefault()
						create.mutate(form, { onSuccess: () => setForm({ name: '', slug: '', ownerEmail: '' }) })
					}}
				>
					<Field id="ops-school-name" label={t('create.name')}>
						<Input id="ops-school-name" value={form.name} onChange={set('name')} data-testid="ops-school-name" />
					</Field>
					<Field
						id="ops-school-slug"
						label={t('create.slug')}
						hint={t('create.slugHint', { domain: import.meta.env.VITE_APP_DOMAIN })}
					>
						<Input id="ops-school-slug" value={form.slug} onChange={set('slug')} data-testid="ops-school-slug" />
					</Field>
					<Field id="ops-school-owner" label={t('create.ownerEmail')}>
						<Input
							id="ops-school-owner"
							type="email"
							value={form.ownerEmail}
							onChange={set('ownerEmail')}
							data-testid="ops-school-owner"
						/>
					</Field>
					{create.error ? (
						<p role="alert" className="text-destructive text-sm" data-testid="ops-create-error">
							{t(errorText(create.error), { ns: 'errors' })}
						</p>
					) : null}
					{create.data ? (
						<Alert data-testid="ops-create-done">
							<AlertDescription>{t('create.done', { name: create.data.name, url: create.data.url })}</AlertDescription>
						</Alert>
					) : null}
					<Button
						type="submit"
						disabled={!form.name || !form.slug || !form.ownerEmail || create.isPending}
						data-testid="ops-create-submit"
					>
						{t('create.submit')}
					</Button>
				</form>
			</CardContent>
		</Card>
	)
}
