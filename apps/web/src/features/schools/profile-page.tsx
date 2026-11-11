import { MEMBER_DATA_EXPORT } from '@dinastia/contracts/learning'
import { AVATAR, type Me } from '@dinastia/contracts/schools'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, ImageInput, PageHeader } from '@dinastia/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { errorText } from '#/app/errors.ts'
import { runExport } from '#/app/exports.ts'
import { uploadFile } from '#/app/files.ts'
import { client, orpc } from '#/app/orpc.ts'
import { meQuery } from '#/app/queries.ts'

/** Профиль участника в школе: аватар (в каждой школе свой), имя, email, роль. Общий для кабинета и обучения. */
export function ProfilePage({ me }: { me: Me }) {
	const { t } = useTranslation(['schools', 'common', 'errors'])
	const qc = useQueryClient()
	const save = async (fileId: string | null) => {
		qc.setQueryData(meQuery().queryKey, await client.schools.updateMyAvatar({ fileId }))
	}
	return (
		<>
			<PageHeader title={t('profile.title')} description={t('profile.description', { school: me.school.name })} />
			<Card>
				<CardContent className="grid gap-6">
					<ImageInput
						value={me.member.avatarUrl}
						name={me.user.name}
						accept={AVATAR.mime}
						maxSize={AVATAR.maxSize}
						upload={async (file, onProgress) => save(await uploadFile(AVATAR.purpose, file, onProgress))}
						onRemove={() => save(null)}
						errorText={(e) => t(errorText(e), { ns: 'errors' })}
						testId="profile-avatar"
					/>
					<dl className="grid gap-3 text-sm sm:grid-cols-[10rem_1fr]">
						<dt className="text-muted-foreground">{t('profile.name')}</dt>
						<dd data-testid="profile-name">{me.user.name}</dd>
						<dt className="text-muted-foreground">{t('profile.email')}</dt>
						<dd>{me.user.email}</dd>
						<dt className="text-muted-foreground">{t('profile.role')}</dt>
						<dd>{t(`roles.${me.member.role}`, { ns: 'common' })}</dd>
					</dl>
				</CardContent>
			</Card>
			<MyData />
		</>
	)
}

/** Мои данные в школе (5.5): архив по запросу; удалить — через школу (она оператор ПДн). */
function MyData() {
	const { t } = useTranslation(['schools', 'errors'])
	const { data: legal } = useQuery(orpc.schools.legal.queryOptions())
	const download = useMutation({ mutationFn: () => runExport(MEMBER_DATA_EXPORT, {}) })
	return (
		<Card className="mt-6" data-testid="my-data">
			<CardHeader>
				<CardTitle>{t('profile.data.title')}</CardTitle>
				<CardDescription>{t('profile.data.description')}</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-3 text-sm">
				<div>
					<Button
						variant="outline"
						onClick={() => download.mutate()}
						disabled={download.isPending}
						data-testid="my-data-download"
					>
						<FileDown />
						{download.isPending ? t('profile.data.preparing') : t('profile.data.download')}
					</Button>
				</div>
				{download.error ? (
					<p role="alert" className="text-destructive">
						{t(errorText(download.error), { ns: 'errors' })}
					</p>
				) : null}
				<p className="text-muted-foreground" data-testid="my-data-delete">
					{legal?.contact
						? t('profile.data.deleteContact', { contact: legal.contact, operator: legal.operator })
						: t('profile.data.deleteSchool', { operator: legal?.operator ?? '' })}
				</p>
			</CardContent>
		</Card>
	)
}
