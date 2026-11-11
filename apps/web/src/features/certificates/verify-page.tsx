// Страница «Проверка сертификата» (карточка 4.7): публичная, на сайте школы, без входа. Номер — из формы или ссылки QR (с кодом —
// имя полностью, без кода — сокращённо).
import {
	Badge,
	Button,
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
	Field,
	Input,
	Skeleton,
} from '@dinastia/ui'
import { useQuery } from '@tanstack/react-query'
import { CircleAlert, CircleCheck, CircleX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorCode, errorText } from '#/app/errors.ts'
import { currentHost } from '#/app/host.ts'
import { orpc } from '#/app/orpc.ts'

export function VerifyPage(props: {
	number?: string | undefined
	code?: string | undefined
	onCheck: (number: string) => void
}) {
	const { t, i18n } = useTranslation(['certificates', 'errors'])
	const [value, setValue] = useState(props.number ?? '')
	useEffect(() => setValue(props.number ?? ''), [props.number])
	const input = { number: props.number ?? '', ...(props.code ? { code: props.code } : {}) }
	const check = useQuery({
		...orpc.certificates.verify.queryOptions({ input }),
		enabled: Boolean(props.number && props.number.length >= 3),
		retry: false,
	})
	const date = (d: Date | string) =>
		new Date(d).toLocaleDateString(i18n.language, {
			day: 'numeric',
			month: 'long',
			year: 'numeric',
			timeZone: 'Europe/Moscow',
		})
	const host = currentHost()
	const example = `${host.kind === 'school' ? host.slug.toUpperCase() : 'SCHOOL'}-${new Date().getFullYear()}-000001`
	const notFound = check.error && errorCode(check.error) === 'CERTIFICATE_NOT_FOUND'
	return (
		<Card className="w-full max-w-md" data-testid="verify-card">
			<CardHeader>
				<CardTitle>
					<h1>{t('verify.title')}</h1>
				</CardTitle>
				<CardDescription>{t('verify.description', { example })}</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-4">
				<form
					className="grid gap-3"
					onSubmit={(e) => {
						e.preventDefault()
						if (value.trim().length >= 3) props.onCheck(value.trim())
					}}
				>
					<Field id="verify-number" label={t('verify.number')}>
						<Input
							id="verify-number"
							value={value}
							maxLength={80}
							autoComplete="off"
							onChange={(e) => setValue(e.target.value)}
							data-testid="verify-number"
						/>
					</Field>
					<Button type="submit" className="justify-self-start" data-testid="verify-submit">
						{t('verify.submit')}
					</Button>
				</form>
				{check.isFetching && !check.data ? (
					<Skeleton className="h-28 w-full" />
				) : check.data ? (
					<div className="grid gap-3 rounded-md border p-4" data-testid="verify-result">
						{check.data.status === 'valid' ? (
							<Badge className="gap-1" data-testid="verify-status">
								<CircleCheck aria-hidden />
								{t('verify.valid')}
							</Badge>
						) : (
							<Badge variant="destructive" className="gap-1" data-testid="verify-status">
								<CircleX aria-hidden />
								{t('verify.revoked')}
							</Badge>
						)}
						<dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[auto_minmax(0,1fr)] [&_dd]:mb-1.5 sm:[&_dd]:mb-0">
							<dt className="text-muted-foreground">{t('verify.number')}</dt>
							<dd className="font-medium">{check.data.number}</dd>
							<dt className="text-muted-foreground">{t('verify.student')}</dt>
							<dd className="font-medium" data-testid="verify-student">
								{check.data.studentName}
							</dd>
							<dt className="text-muted-foreground">{t('verify.course')}</dt>
							<dd>{check.data.courseTitle}</dd>
							<dt className="text-muted-foreground">{t('verify.issuedAt')}</dt>
							<dd>{date(check.data.issuedAt)}</dd>
							<dt className="text-muted-foreground">{t('verify.school')}</dt>
							<dd>{check.data.schoolName}</dd>
						</dl>
						{check.data.nameHidden && <p className="text-muted-foreground text-xs">{t('verify.nameHidden')}</p>}
					</div>
				) : check.error ? (
					<p role="alert" className="flex items-start gap-2 text-destructive text-sm" data-testid="verify-error">
						<CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
						{notFound ? t('verify.notFound') : t(errorText(check.error), { ns: 'errors' })}
					</p>
				) : null}
			</CardContent>
		</Card>
	)
}
