// Сертификат ученика (карточка 4.7): «Скачать сертификат» у пройденного курса — в кабинете и на странице курса; пока PDF
// готовится — «Сертификат готовится». Список обновляется, пока есть неготовые, и первую минуту, если сертификата курса ещё нет:
// его выдаёт задача сразу после прохождения курса.
import { Button, cn, toast } from '@dinastia/ui'
import { useQuery } from '@tanstack/react-query'
import { Award } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorText } from '#/app/errors.ts'
import { client, orpc } from '#/app/orpc.ts'
import { meQuery } from '#/app/queries.ts'

export function MyCertificate({ courseId, className }: { courseId: string; className?: string }) {
	const { t } = useTranslation(['certificates', 'errors'])
	const { data: me } = useQuery(meQuery())
	const enabled = me?.permissions.includes('certificates.own') ?? false
	const list = useQuery({
		...orpc.certificates.my.list.queryOptions(),
		enabled,
		refetchInterval: (q) => {
			const mine = q.state.data?.find((c) => c.courseId === courseId)
			if (mine) return mine.status === 'ready' ? false : 5_000
			return q.state.dataUpdateCount < 12 ? 5_000 : false
		},
	})
	const [busy, setBusy] = useState(false)
	const certificate = list.data?.find((c) => c.courseId === courseId)
	if (!certificate) return null
	if (certificate.status !== 'ready')
		return (
			<p className={cn('text-muted-foreground text-sm', className)} data-testid="my-certificate-pending">
				{t('my.pending')}
			</p>
		)
	return (
		<Button
			variant="outline"
			size="sm"
			className={className}
			disabled={busy}
			onClick={async () => {
				setBusy(true)
				try {
					window.location.assign((await client.certificates.my.download({ id: certificate.id })).url)
				} catch (e) {
					toast.error(t(errorText(e), { ns: 'errors' }))
				} finally {
					setBusy(false)
				}
			}}
			data-testid="my-certificate"
		>
			<Award />
			{t('my.download')}
		</Button>
	)
}
