import { Button } from '@dinastia/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { authClient } from '#/app/auth.ts'
import { sessionQuery } from '#/app/queries.ts'

/** Выход: сессия, кэш запросов — и на главную текущего хоста. */
export function useSignOut() {
	const qc = useQueryClient()
	return async () => {
		await authClient.signOut()
		qc.clear()
		window.location.assign('/')
	}
}

/** «Выйти» на экранах ошибки и «не найдено» — только если вход выполнен (иначе из ошибки не выбраться). */
export function SignOutButton() {
	const { t } = useTranslation()
	const signOut = useSignOut()
	const { data: session } = useQuery(sessionQuery)
	if (!session) return null
	return (
		<Button variant="outline" onClick={signOut} data-testid="error-sign-out">
			{t('signOut')}
		</Button>
	)
}
