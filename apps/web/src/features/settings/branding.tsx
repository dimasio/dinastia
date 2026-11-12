// «Оформление» (5.9б, спека branding.md): логотип и фавикон сохраняются сразу при загрузке; цвета, шрифт, скругления и тема
// по умолчанию — кнопкой «Сохранить», до неё видны в предпросмотре светлой и тёмной темы. Контраст основного цвета
// проверяется здесь же (тот же расчёт, что на сервере).
import {
	BRANDING_FAVICON,
	BRANDING_FONTS,
	BRANDING_LOGO,
	BRANDING_RADII,
	type BrandingTheme,
	type BrandingView,
	COLOR_SCHEMES,
	checkBrandColor,
	DEFAULT_BRANDING,
	HexColor,
	previewTokens,
} from '@dinastia/contracts/branding'
import {
	Button,
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
	Field,
	ImageInput,
	Input,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	toast,
} from '@dinastia/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type CSSProperties, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorText } from '#/app/errors.ts'
import { uploadFile } from '#/app/files.ts'
import { client, orpc } from '#/app/orpc.ts'
import { meQuery } from '#/app/queries.ts'

/** Применить сохранённую тему на этой странице сразу: перечитать CSS темы и фавикон. */
function reloadTheme() {
	const v = Date.now()
	const css = document.querySelector<HTMLLinkElement>('link[href^="/api/branding.css"]')
	if (css) css.href = `/api/branding.css?v=${v}`
	const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
	if (icon) icon.href = `/api/branding/favicon?v=${v}`
}

/** «4,6» — десятичная запятая. */
const ratioText = (r: number) => new Intl.NumberFormat('ru', { maximumFractionDigits: 1 }).format(r)

export function Branding() {
	const { t } = useTranslation(['settings', 'errors'])
	const qc = useQueryClient()
	const { data } = useQuery(orpc.schools.branding.get.queryOptions())
	const applied = (view: BrandingView) => {
		qc.setQueryData(orpc.schools.branding.get.queryKey(), view)
		void qc.invalidateQueries({ queryKey: meQuery().queryKey })
		reloadTheme()
	}
	const files = async (patch: { logoFileId?: string | null; faviconFileId?: string | null }) =>
		applied(await client.schools.branding.update(patch))
	if (!data) return null
	return (
		<Card data-testid="settings-branding">
			<CardHeader>
				<CardTitle>{t('branding.title')}</CardTitle>
				<CardDescription>{t('branding.description')}</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-6 sm:grid-cols-2">
				<div className="grid gap-2">
					<span className="font-medium text-sm">{t('branding.logo')}</span>
					<ImageInput
						value={data.logoUrl}
						name={t('branding.logo')}
						accept={BRANDING_LOGO.mime}
						maxSize={BRANDING_LOGO.maxSize}
						preview="wide"
						uploadLabel={t('branding.upload')}
						upload={async (file, onProgress) =>
							files({ logoFileId: await uploadFile(BRANDING_LOGO.purpose, file, onProgress) })
						}
						onRemove={() => files({ logoFileId: null })}
						errorText={(e) => t(errorText(e), { ns: 'errors' })}
						testId="branding-logo"
					/>
					<p className="text-muted-foreground text-sm">{t('branding.logoHint')}</p>
				</div>
				<div className="grid content-start gap-2">
					<span className="font-medium text-sm">{t('branding.favicon')}</span>
					<ImageInput
						value={data.faviconUrl}
						name={t('branding.favicon')}
						accept={BRANDING_FAVICON.mime}
						maxSize={BRANDING_FAVICON.maxSize}
						uploadLabel={t('branding.upload')}
						upload={async (file, onProgress) =>
							files({ faviconFileId: await uploadFile(BRANDING_FAVICON.purpose, file, onProgress) })
						}
						onRemove={() => files({ faviconFileId: null })}
						errorText={(e) => t(errorText(e), { ns: 'errors' })}
						testId="branding-favicon"
					/>
					<p className="text-muted-foreground text-sm">{t('branding.faviconHint')}</p>
				</div>
			</CardContent>
			<ThemeForm saved={data.theme} onSaved={applied} />
		</Card>
	)
}

function ThemeForm({ saved, onSaved }: { saved: BrandingTheme; onSaved: (v: BrandingView) => void }) {
	const { t } = useTranslation(['settings', 'errors'])
	const [theme, setTheme] = useState(saved)
	useEffect(() => setTheme(saved), [saved])
	const set = <K extends keyof BrandingTheme>(key: K, value: BrandingTheme[K]) =>
		setTheme((s) => ({ ...s, [key]: value }))
	const save = useMutation(
		orpc.schools.branding.update.mutationOptions({
			onSuccess: (view) => {
				onSaved(view)
				toast.success(t('saved'))
			},
		}),
	)
	const contrast = theme.primaryColor ? checkBrandColor(theme.primaryColor) : null
	const changed = JSON.stringify(theme) !== JSON.stringify(saved)
	return (
		<form
			onSubmit={(e) => {
				e.preventDefault()
				save.mutate({ theme })
			}}
		>
			<CardContent className="grid gap-6 border-t pt-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
				<div className="grid content-start gap-5">
					<ColorField
						id="branding-primary"
						label={t('branding.primary')}
						hint={t('branding.primaryHint')}
						value={theme.primaryColor}
						fallback="#171717"
						onChange={(v) => set('primaryColor', v)}
					/>
					{contrast ? (
						<div className="text-sm" role={contrast.ok ? undefined : 'alert'} data-testid="branding-contrast">
							{contrast.ok ? (
								<span className="text-muted-foreground">
									{t('branding.contrastOk', { ratio: ratioText(contrast.ratio) })}
								</span>
							) : (
								<span className="flex flex-wrap items-center gap-2 text-destructive">
									{t('branding.contrastLow', { ratio: ratioText(contrast.ratio) })}
									{contrast.suggestion ? (
										<Button
											type="button"
											size="sm"
											variant="outline"
											onClick={() => set('primaryColor', contrast.suggestion)}
											data-testid="branding-contrast-fix"
										>
											{t('branding.useSuggestion', { color: contrast.suggestion })}
										</Button>
									) : null}
								</span>
							)}
						</div>
					) : null}
					<ColorField
						id="branding-accent"
						label={t('branding.accent')}
						hint={t('branding.accentHint')}
						value={theme.accentColor}
						fallback={theme.primaryColor ?? '#171717'}
						onChange={(v) => set('accentColor', v)}
					/>
					<Choice
						id="branding-font"
						label={t('branding.font')}
						value={theme.font}
						options={BRANDING_FONTS}
						text={(o) => t(`branding.fonts.${o}`)}
						onChange={(v) => set('font', v)}
					/>
					<Choice
						id="branding-radius"
						label={t('branding.radius')}
						value={theme.radius}
						options={BRANDING_RADII}
						text={(o) => t(`branding.radii.${o}`)}
						onChange={(v) => set('radius', v)}
					/>
					<Choice
						id="branding-scheme"
						label={t('branding.scheme')}
						hint={t('branding.schemeHint')}
						value={theme.defaultScheme}
						options={COLOR_SCHEMES}
						text={(o) => t(`branding.schemes.${o}`)}
						onChange={(v) => set('defaultScheme', v)}
					/>
				</div>
				<div className="grid content-start gap-3" data-testid="branding-preview">
					<span className="font-medium text-sm">{t('branding.preview')}</span>
					<Preview theme={theme} scheme="light" />
					<Preview theme={theme} scheme="dark" />
				</div>
				{save.error ? (
					<p role="alert" className="text-destructive text-sm lg:col-span-2" data-testid="branding-error">
						{t(errorText(save.error), { ns: 'errors' })}
					</p>
				) : null}
			</CardContent>
			<CardFooter className="mt-6 flex flex-wrap gap-2">
				<Button
					type="submit"
					disabled={!changed || contrast?.ok === false || save.isPending}
					data-testid="branding-save"
				>
					{t('save')}
				</Button>
				<Button type="button" variant="outline" onClick={() => setTheme(DEFAULT_BRANDING)} data-testid="branding-reset">
					{t('branding.reset')}
				</Button>
			</CardFooter>
		</form>
	)
}

/** Цвет: палитра браузера и ввод `#rrggbb`; пусто — как в теме Dinastia. */
function ColorField(props: {
	id: string
	label: string
	hint: string
	value: string | null
	/** Цвет на палитре, пока поле пустое (что будет на самом деле). */
	fallback: string
	onChange: (v: string | null) => void
}) {
	const { t } = useTranslation('settings')
	const [text, setText] = useState(props.value ?? '')
	useEffect(() => setText(props.value ?? ''), [props.value])
	const commit = (raw: string) => {
		setText(raw)
		if (raw.trim() === '') return props.onChange(null)
		const parsed = HexColor.safeParse(raw)
		if (parsed.success) props.onChange(parsed.data)
	}
	return (
		<Field id={props.id} label={props.label} hint={props.hint}>
			<div className="flex items-center gap-2">
				<input
					type="color"
					aria-label={props.label}
					value={props.value ?? props.fallback}
					onChange={(e) => commit(e.target.value)}
					className="h-9 w-12 shrink-0 cursor-pointer rounded-md border bg-background p-1"
					data-testid={`${props.id}-picker`}
				/>
				<Input
					id={props.id}
					value={text}
					placeholder={t('branding.colorPlaceholder')}
					onChange={(e) => commit(e.target.value)}
					maxLength={7}
					aria-describedby={`${props.id}-hint`}
					aria-invalid={text !== '' && !HexColor.safeParse(text).success}
					className="font-mono"
					data-testid={props.id}
				/>
				{props.value ? (
					<Button type="button" variant="ghost" size="sm" onClick={() => commit('')}>
						{t('branding.clearColor')}
					</Button>
				) : null}
			</div>
		</Field>
	)
}

function Choice<T extends string>(props: {
	id: string
	label: string
	hint?: string
	value: T
	options: readonly T[]
	text: (o: T) => string
	onChange: (v: T) => void
}) {
	return (
		<Field id={props.id} label={props.label} {...(props.hint ? { hint: props.hint } : {})}>
			<Select value={props.value} onValueChange={(v) => props.onChange(v as T)}>
				<SelectTrigger id={props.id} data-testid={props.id}>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{props.options.map((o) => (
						<SelectItem key={o} value={o}>
							{props.text(o)}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</Field>
	)
}

/** Мини-кабинет в теме школы: токены — инлайн на обёртке (поверх текущей темы страницы), тёмная — классом `dark`. */
function Preview({ theme, scheme }: { theme: BrandingTheme; scheme: 'light' | 'dark' }) {
	const { t } = useTranslation('settings')
	const tokens = previewTokens(theme, scheme)
	const style = { ...tokens, fontFamily: tokens['--font-sans'] } as CSSProperties
	return (
		<div className={scheme === 'dark' ? 'dark' : undefined} style={style} data-testid={`branding-preview-${scheme}`}>
			<div className="grid gap-3 rounded-lg border bg-background p-4 text-foreground">
				<div className="flex items-center justify-between gap-2 text-xs">
					<span className="font-semibold">{t(`branding.schemes.${scheme}`)}</span>
					<span className="rounded-md bg-accent px-2 py-0.5 text-accent-foreground">{t('branding.sample.badge')}</span>
				</div>
				<div className="grid gap-2 rounded-lg border bg-card p-3 text-card-foreground">
					<span className="font-medium text-sm">{t('branding.sample.lesson')}</span>
					<div className="h-2 overflow-hidden rounded-full bg-muted">
						<div className="h-full w-2/3 rounded-full bg-primary" />
					</div>
					<span className="text-primary text-sm underline">{t('branding.sample.link')}</span>
				</div>
				<div className="flex flex-wrap gap-2">
					<span className="inline-flex h-8 items-center rounded-md bg-primary px-3 font-medium text-primary-foreground text-sm">
						{t('branding.sample.button')}
					</span>
					<span className="inline-flex h-8 items-center rounded-md border px-3 text-sm">
						{t('branding.sample.secondary')}
					</span>
				</div>
			</div>
		</div>
	)
}
