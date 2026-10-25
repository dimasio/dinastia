import { AVATAR, type Me } from '@dinastia/contracts/schools'
import { Card, CardContent, ImageInput, PageHeader } from '@dinastia/ui'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { errorText } from '#/app/errors.ts'
import { uploadFile } from '#/app/files.ts'
import { client } from '#/app/orpc.ts'
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
		</>
	)
}
