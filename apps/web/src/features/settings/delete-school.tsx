// «Удалить школу» (5.5): только владелец; подтверждение — адрес школы. Школа закрывается сразу, через 30 дней данные
// удаляются; отменить можно в «Моих школах» на сайте Dinastia — туда и переходим.
import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
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
import { hostUrl } from '#/app/host.ts'
import { orpc } from '#/app/orpc.ts'

export function DeleteSchool({ school }: { school: { slug: string; name: string } }) {
	const { t } = useTranslation(['settings', 'errors'])
	const [open, setOpen] = useState(false)
	const [slug, setSlug] = useState('')
	const remove = useMutation(
		orpc.schools.requestDeletion.mutationOptions({ onSuccess: () => window.location.assign(hostUrl()) }),
	)
	return (
		<Card className="border-destructive/40" data-testid="settings-delete-school">
			<CardHeader>
				<CardTitle>{t('deleteSchool.title')}</CardTitle>
				<CardDescription>{t('deleteSchool.description')}</CardDescription>
			</CardHeader>
			<CardContent>
				<Button variant="destructive" onClick={() => setOpen(true)} data-testid="delete-school-open">
					{t('deleteSchool.open')}
				</Button>
			</CardContent>
			<AlertDialog open={open} onOpenChange={setOpen}>
				<AlertDialogContent>
					<form
						className="grid gap-4"
						onSubmit={(e) => {
							e.preventDefault()
							remove.mutate({ slug })
						}}
					>
						<AlertDialogHeader>
							<AlertDialogTitle>{t('deleteSchool.confirmTitle', { school: school.name })}</AlertDialogTitle>
							<AlertDialogDescription>{t('deleteSchool.confirmDescription')}</AlertDialogDescription>
						</AlertDialogHeader>
						<Field id="delete-school-slug" label={t('deleteSchool.slugLabel', { slug: school.slug })}>
							<Input
								id="delete-school-slug"
								value={slug}
								onChange={(e) => setSlug(e.target.value)}
								autoComplete="off"
								data-testid="delete-school-slug"
							/>
						</Field>
						{remove.error ? (
							<p role="alert" className="text-destructive text-sm">
								{t(errorText(remove.error), { ns: 'errors' })}
							</p>
						) : null}
						<AlertDialogFooter>
							<AlertDialogCancel type="button">{t('deleteSchool.cancel')}</AlertDialogCancel>
							<Button
								type="submit"
								variant="destructive"
								disabled={slug.trim().toLowerCase() !== school.slug || remove.isPending}
								data-testid="delete-school-submit"
							>
								{t('deleteSchool.submit')}
							</Button>
						</AlertDialogFooter>
					</form>
				</AlertDialogContent>
			</AlertDialog>
		</Card>
	)
}
