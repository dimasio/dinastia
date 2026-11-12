// Экран /admin/settings (скилл settings): поля приходят из реестра `defineSettings` сервера с видом контрола; раздел
// сохраняется целиком, проверяет сервер (ошибка — под полем раздела).
import type { SettingField } from '@dinastia/contracts/settings'
import {
	Button,
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
	EmptyState,
	Field,
	Input,
	PageHeader,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Switch,
	toast,
} from '@dinastia/ui'
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorText } from '#/app/errors.ts'
import { orpc } from '#/app/orpc.ts'
import { meQuery } from '#/app/queries.ts'
import { Branding } from './branding.tsx'
import { DeleteSchool } from './delete-school.tsx'
import { SupportAccess } from './support-access.tsx'

type Value = SettingField['value']

export function SettingsPage() {
	const { t } = useTranslation('settings')
	const { data: fields } = useSuspenseQuery(orpc.settings.list.queryOptions())
	// раздел экрана = модуль + группа: сохраняется одним запросом в модуль
	const sections = [...new Map(fields.map((f) => [`${f.module}:${f.group}`, f])).keys()]
	const { data: me } = useQuery(meQuery())
	return (
		<>
			<PageHeader title={t('title')} description={t('description')} />
			{sections.length === 0 ? <EmptyState title={t('empty')} /> : null}
			<div className="grid gap-6">
				{sections.map((key) => (
					<Section key={key} fields={fields.filter((f) => `${f.module}:${f.group}` === key)} />
				))}
				{me?.permissions.includes('schools.branding.manage') ? <Branding /> : null}
				<SupportAccess />
				{me?.permissions.includes('schools.delete') ? <DeleteSchool school={me.school} /> : null}
			</div>
		</>
	)
}

function Section({ fields }: { fields: SettingField[] }) {
	const { t } = useTranslation(['settings', 'errors'])
	const qc = useQueryClient()
	const first = fields[0] as SettingField
	const initial = () => Object.fromEntries(fields.map((f) => [f.name, f.value])) as Record<string, Value>
	const [values, setValues] = useState(initial)
	const editable = fields.some((f) => f.editable)
	const save = useMutation(
		orpc.settings.update.mutationOptions({
			onSuccess: (list) => {
				qc.setQueryData(orpc.settings.list.queryKey(), list)
				toast.success(t('saved'))
			},
		}),
	)
	const changed = fields.filter((f) => f.editable && values[f.name] !== f.value)
	const groupHint = t(`groupHints.${first.group}`, { defaultValue: '' })
	return (
		<Card data-testid={`settings-${first.module}-${first.group}`}>
			<CardHeader>
				<CardTitle>{t(`groups.${first.group}` as never)}</CardTitle>
				{groupHint ? <CardDescription>{groupHint}</CardDescription> : null}
			</CardHeader>
			<form
				onSubmit={(e) => {
					e.preventDefault()
					save.mutate({
						module: first.module,
						patch: Object.fromEntries(changed.map((f) => [f.name, values[f.name] as string | number | boolean])),
					})
				}}
			>
				<CardContent className="grid gap-5">
					{fields.map((f) => (
						<SettingInput
							key={f.name}
							field={f}
							value={values[f.name] ?? null}
							onChange={(v) => setValues((s) => ({ ...s, [f.name]: v }))}
						/>
					))}
					{save.error ? (
						<p role="alert" className="text-destructive text-sm" data-testid="settings-error">
							{t(errorText(save.error), { ns: 'errors' })}
						</p>
					) : null}
					{!editable ? <p className="text-muted-foreground text-sm">{t('readOnly')}</p> : null}
				</CardContent>
				{editable ? (
					<CardFooter className="mt-6">
						<Button type="submit" disabled={changed.length === 0 || save.isPending} data-testid="settings-save">
							{t('save')}
						</Button>
					</CardFooter>
				) : null}
			</form>
		</Card>
	)
}

function SettingInput({ field, value, onChange }: { field: SettingField; value: Value; onChange: (v: Value) => void }) {
	const { t } = useTranslation('settings')
	const id = `setting-${field.module}-${field.name}`
	const label = t(`${field.module}.${field.name}.title` as never)
	const hint = t(`${field.module}.${field.name}.description` as never)
	const disabled = !field.editable
	if (field.kind === 'boolean')
		return (
			<div className="flex items-start justify-between gap-4">
				<div className="grid gap-1">
					<label htmlFor={id} className="font-medium text-sm">
						{label}
					</label>
					<p className="text-muted-foreground text-sm">{hint}</p>
				</div>
				<Switch id={id} checked={value === true} onCheckedChange={onChange} disabled={disabled} />
			</div>
		)
	if (field.kind === 'select')
		return (
			<Field id={id} label={label} hint={hint}>
				<Select value={String(value ?? '')} onValueChange={onChange} disabled={disabled}>
					<SelectTrigger id={id}>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{field.options?.map((o) => (
							<SelectItem key={o} value={o}>
								{t(`${field.module}.${field.name}.options.${o}` as never, { defaultValue: o })}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</Field>
		)
	const type = { text: 'text', email: 'email', url: 'url', number: 'number' }[field.kind]
	return (
		<Field id={id} label={label} hint={hint}>
			<Input
				id={id}
				type={type}
				value={String(value ?? '')}
				onChange={(e) => onChange(field.kind === 'number' ? Number(e.target.value) : e.target.value)}
				maxLength={field.maxLength}
				required={!field.optional && field.kind !== 'text'}
				disabled={disabled}
				aria-describedby={`${id}-hint`}
				data-testid={id}
			/>
		</Field>
	)
}
