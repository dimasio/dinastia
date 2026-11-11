// Выданные сертификаты курса (скилл admin-resource, карточка 4.7): номер, ученик, дата, состояние; скачать PDF, аннулировать;
// «Выдать прошедшим» — над списком. Куратор видит только свои потоки (сервер). Ресурс строится на курс — фабрика.
import { type CertificateListInput, CertificateRow } from '@dinastia/contracts/certificates'
import { Badge, toast } from '@dinastia/ui'
import { defineResource } from '@dinastia/ui/resource'
import { Award } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { z } from 'zod'
import { i18n } from '#/app/i18n.ts'
import { client } from '#/app/orpc.ts'

type ListInput = Omit<z.input<typeof CertificateListInput>, 'courseId'>

function State({ row }: { row: CertificateRow }) {
	const { t } = useTranslation('certificates')
	if (row.revokedAt) return <Badge variant="destructive">{t('issued.values.status.revoked')}</Badge>
	return (
		<Badge variant={row.status === 'ready' ? 'default' : row.status === 'failed' ? 'destructive' : 'secondary'}>
			{t(`issued.values.status.${row.status}`)}
		</Badge>
	)
}

export function issuedResource(opts: { courseId: string }) {
	return defineResource({
		key: 'issued',
		ns: 'certificates',
		scope: opts.courseId,
		row: CertificateRow,
		list: (input: ListInput) => client.certificates.list({ ...input, courseId: opts.courseId }),
		perms: { read: 'certificates.view', write: 'certificates.manage' },
		columns: [
			{ field: 'number', sort: 'number' },
			{ field: 'studentName', sort: 'studentName' },
			{ field: 'issuedAt', sort: 'issuedAt', render: 'date' },
			{ field: 'status', render: (row) => <State row={row} /> },
		],
		search: true,
		pageActions: [
			{
				key: 'issue',
				perm: 'certificates.manage',
				icon: <Award />,
				run: async () => {
					const r = await client.certificates.issueCompleted({ courseId: opts.courseId })
					toast.success(
						r.issued || r.requeued
							? i18n.t('certificates:issued.issueDone', r)
							: i18n.t('certificates:issued.issueNone'),
					)
				},
			},
		],
		actions: [
			{
				key: 'download',
				perm: 'certificates.view',
				visible: (row) => row.status === 'ready',
				run: async (row) => {
					window.location.assign((await client.certificates.download({ id: row.id })).url)
				},
			},
			{
				key: 'revoke',
				variant: 'destructive',
				confirm: true,
				visible: (row) => !row.revokedAt,
				run: (row) => client.certificates.revoke({ id: row.id }),
			},
		],
	})
}
