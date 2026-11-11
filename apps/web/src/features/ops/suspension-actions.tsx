// Приостановка и возобновление школы в карточке консоли (5.6в): причина обязательна — её увидит владелец.
import type { OpsSchoolCard } from '@dinastia/contracts/ops'
import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	Button,
	Field,
	Textarea,
	toast,
} from '@dinastia/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { z } from 'zod'
import { errorText } from '#/app/errors.ts'
import { orpc } from '#/app/orpc.ts'

export function SuspensionActions({ school }: { school: z.infer<typeof OpsSchoolCard> }) {
	const { t } = useTranslation(['ops', 'errors'])
	const qc = useQueryClient()
	const [open, setOpen] = useState(false)
	const [reason, setReason] = useState('')
	const done = (msg: string) => (card: z.infer<typeof OpsSchoolCard>) => {
		qc.setQueryData(orpc.ops.schools.get.queryKey({ input: { id: card.id } }), card)
		setOpen(false)
		setReason('')
		toast.success(msg)
	}
	const onError = (e: unknown) => toast.error(t(errorText(e), { ns: 'errors' }))
	const suspend = useMutation(orpc.ops.schools.suspend.mutationOptions({ onSuccess: done(t('suspend.done')), onError }))
	const resume = useMutation(
		orpc.ops.schools.resume.mutationOptions({ onSuccess: done(t('suspend.resumed')), onError }),
	)
	if (school.status === 'deleted') return null
	if (school.status === 'suspended')
		return (
			<Button
				variant="outline"
				onClick={() => resume.mutate({ id: school.id })}
				disabled={resume.isPending}
				data-testid="ops-resume"
			>
				{t('suspend.resume')}
			</Button>
		)
	return (
		<>
			<Button variant="destructive" onClick={() => setOpen(true)} data-testid="ops-suspend">
				{t('suspend.open')}
			</Button>
			<AlertDialog open={open} onOpenChange={setOpen}>
				<AlertDialogContent>
					<form
						className="grid gap-4"
						onSubmit={(e) => {
							e.preventDefault()
							suspend.mutate({ id: school.id, reason })
						}}
					>
						<AlertDialogHeader>
							<AlertDialogTitle>{t('suspend.title', { school: school.name })}</AlertDialogTitle>
							<AlertDialogDescription>{t('suspend.description')}</AlertDialogDescription>
						</AlertDialogHeader>
						<Field id="ops-suspend-reason" label={t('suspend.reason')}>
							<Textarea
								id="ops-suspend-reason"
								value={reason}
								onChange={(e) => setReason(e.target.value)}
								maxLength={500}
								data-testid="ops-suspend-reason"
							/>
						</Field>
						<AlertDialogFooter>
							<AlertDialogCancel type="button">{t('suspend.cancel')}</AlertDialogCancel>
							<Button
								type="submit"
								variant="destructive"
								disabled={reason.trim().length < 3 || suspend.isPending}
								data-testid="ops-suspend-submit"
							>
								{t('suspend.submit')}
							</Button>
						</AlertDialogFooter>
					</form>
				</AlertDialogContent>
			</AlertDialog>
		</>
	)
}
