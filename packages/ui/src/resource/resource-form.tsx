// Форма ресурса (скилл admin-resource): поля из zod-схемы контракта, проверка той же схемой, что на сервере.
import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo, useState } from 'react'
import { Controller, type FieldValues, useForm } from 'react-hook-form'
import type { z } from 'zod'
import { Field } from '#/components/field.tsx'
import { Alert, AlertDescription } from '#/components/ui/alert.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select.tsx'
import { Switch } from '#/components/ui/switch.tsx'
import { Textarea } from '#/components/ui/textarea.tsx'
import { RichTextEditor } from '#/rich-text/lazy.tsx'
import { useResourceEnv, useResourceT } from './context.tsx'
import { type FieldInfo, fieldsFromSchema } from './fields.ts'
import type { FieldOverride, FormDef } from './types.ts'

export interface ResourceFormProps {
	ns: string
	resourceKey: string
	form: FormDef<z.ZodObject>
	defaultValues?: Record<string, unknown> | undefined
	submitLabel: string
	onSubmit: (values: Record<string, unknown>) => Promise<unknown>
	onCancel?: () => void
	testId: string
}

const isCode = (m: string | undefined) => Boolean(m && /^[A-Z_]+$/.test(m))

export function ResourceForm({
	ns,
	resourceKey,
	form,
	defaultValues,
	submitLabel,
	onSubmit,
	onCancel,
	testId,
}: ResourceFormProps) {
	const { t, r, value } = useResourceT(ns, resourceKey)
	const { errorText } = useResourceEnv()
	const rows = useMemo(() => fieldsFromSchema(form), [form])
	const [error, setError] = useState<string>()
	const {
		control,
		handleSubmit,
		watch,
		formState: { errors, isSubmitting },
	} = useForm<FieldValues>({
		resolver: zodResolver(form.schema as never),
		defaultValues: defaultValues ?? {},
		shouldUnregister: true,
	})
	const values = watch()
	const overrides = form.fields as Record<string, FieldOverride<Record<string, unknown>>> | undefined

	const submit = handleSubmit(async (data) => {
		setError(undefined)
		try {
			await onSubmit(data)
		} catch (err) {
			setError(errorText(err))
		}
	})

	const renderControl = (f: FieldInfo, id: string) => (
		<Controller
			name={f.name}
			control={control}
			render={({ field }) => {
				const invalid = Boolean(errors[f.name])
				const describedBy = invalid ? `${id}-error` : f.hint ? `${id}-hint` : undefined
				const common = { id, 'aria-invalid': invalid, 'aria-describedby': describedBy }
				switch (f.widget) {
					case 'select':
						return (
							<Select value={(field.value as string | undefined) ?? ''} onValueChange={field.onChange}>
								<SelectTrigger {...common} className="w-full" data-testid={`${testId}-${f.name}`}>
									<SelectValue placeholder={t('common:resource.select')} />
								</SelectTrigger>
								<SelectContent>
									{(f.options ?? []).map((o) => (
										<SelectItem key={o} value={o}>
											{value(f.name, o, f.labels)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						)
					case 'switch':
						return (
							<Switch
								{...common}
								checked={Boolean(field.value)}
								onCheckedChange={field.onChange}
								data-testid={`${testId}-${f.name}`}
							/>
						)
					case 'richtext':
						return (
							<RichTextEditor
								id={id}
								profile={f.richText ?? 'lesson'}
								value={field.value as never}
								onChange={field.onChange}
								invalid={invalid}
								{...(describedBy ? { 'aria-describedby': describedBy } : {})}
								aria-label={r(`fields.${f.name}`)}
								testId={`${testId}-${f.name}`}
							/>
						)
					case 'textarea':
						return (
							<Textarea
								{...common}
								value={(field.value as string | undefined) ?? ''}
								onChange={field.onChange}
								onBlur={field.onBlur}
								data-testid={`${testId}-${f.name}`}
							/>
						)
					default:
						return (
							<Input
								{...common}
								type={f.widget === 'email' ? 'email' : f.widget === 'number' ? 'number' : 'text'}
								autoComplete={f.widget === 'email' ? 'email' : 'off'}
								required={f.required}
								value={(field.value as string | number | undefined) ?? ''}
								onChange={(e) =>
									field.onChange(
										f.widget === 'number' && e.target.value !== '' ? Number(e.target.value) : e.target.value,
									)
								}
								onBlur={field.onBlur}
								ref={field.ref}
								data-testid={`${testId}-${f.name}`}
							/>
						)
				}
			}}
		/>
	)

	return (
		<form onSubmit={submit} className="grid gap-4" noValidate data-testid={testId}>
			{rows.map((row) => {
				const visible = row.filter((f) => overrides?.[f.name]?.visibleIf?.(values) ?? true)
				if (!visible.length) return null
				return (
					<div key={row.map((f) => f.name).join()} className="grid gap-4 sm:auto-cols-fr sm:grid-flow-col">
						{visible.map((f) => {
							const id = `${testId}-${f.name}-input`
							const message = errors[f.name]?.message as string | undefined
							return (
								<Field
									key={f.name}
									id={id}
									label={r(`fields.${f.name}`)}
									hint={f.hint ? r(`hints.${f.name}`) : undefined}
									error={errors[f.name] ? t(`errors:${isCode(message) ? message : 'INVALID_INPUT'}`) : undefined}
								>
									{renderControl(f, id)}
								</Field>
							)
						})}
					</div>
				)
			})}
			{error ? (
				<Alert variant="destructive">
					<AlertDescription data-testid={`${testId}-error`}>{error}</AlertDescription>
				</Alert>
			) : null}
			<div className="flex justify-end gap-2">
				{onCancel ? (
					<Button type="button" variant="outline" onClick={onCancel}>
						{t('common:cancel')}
					</Button>
				) : null}
				<Button type="submit" disabled={isSubmitting} data-testid={`${testId}-submit`}>
					{submitLabel}
				</Button>
			</div>
		</form>
	)
}
