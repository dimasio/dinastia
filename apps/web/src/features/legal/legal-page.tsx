// Страницы /legal/offer и /legal/privacy (5.5). На корневом домене — документы Dinastia; на сайте школы политика —
// типовая с реквизитами школы (или переход на свою политику школы, если она указана в настройках).
import { Alert, AlertDescription, Card, CardContent, Skeleton } from '@dinastia/ui'
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { currentHost } from '#/app/host.ts'
import { orpc } from '#/app/orpc.ts'
import { Markdown } from './markdown.tsx'
import offer from './texts/offer.md?raw'
import privacy from './texts/privacy.md?raw'
import schoolPrivacy from './texts/school-privacy.md?raw'

export type LegalDoc = 'offer' | 'privacy'

const fill = (src: string, values: Record<string, string>) => src.replace(/\{\{(\w+)\}\}/g, (_, k) => values[k] ?? '')

export function LegalPage({ doc }: { doc: LegalDoc }) {
	const onSchool = currentHost().kind === 'school' && doc === 'privacy'
	return onSchool ? <SchoolPrivacy /> : <Document source={doc === 'offer' ? offer : privacy} />
}

function SchoolPrivacy() {
	const { t } = useTranslation('common')
	const school = useQuery(orpc.schools.current.queryOptions())
	const legal = useQuery(orpc.schools.legal.queryOptions())
	const own = legal.data?.privacyUrl
	useEffect(() => {
		if (own) window.location.replace(own)
	}, [own])
	if (!school.data || !legal.data || own) return <Skeleton className="h-96 w-full" />
	return (
		<Document
			source={fill(schoolPrivacy, {
				school: school.data.name,
				operator: legal.data.operator,
				contact: legal.data.contact ?? t('legal.noContact'),
			})}
		/>
	)
}

function Document({ source }: { source: string }) {
	const { t } = useTranslation('common')
	return (
		<Card className="w-full max-w-3xl" data-testid="legal-doc">
			<CardContent className="grid gap-3 text-sm leading-relaxed">
				{/^Редакция: проект/m.test(source) ? (
					<Alert data-testid="legal-draft">
						<AlertDescription>{t('legal.draft')}</AlertDescription>
					</Alert>
				) : null}
				<Markdown source={source} />
			</CardContent>
		</Card>
	)
}
