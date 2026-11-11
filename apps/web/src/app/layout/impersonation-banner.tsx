// Баннер сессии «от имени» (5.6г): оператор Dinastia работает за участника — видно всегда, выход в один клик (возврат в консоль).
import type { Me } from '@dinastia/contracts/schools'
import { Button } from '@dinastia/ui'
import { useTranslation } from 'react-i18next'
import { authClient } from '#/app/auth.ts'

export function ImpersonationBanner({ me }: { me: Me }) {
	const { t } = useTranslation('common')
	if (!me.impersonation) return null
	return (
		<div
			role="status"
			className="flex flex-wrap items-center justify-between gap-2 border-b bg-amber-100 px-4 py-2 text-amber-950 text-sm md:px-8 dark:bg-amber-950 dark:text-amber-100"
			data-testid="impersonation-banner"
		>
			<span>
				{t('impersonation.banner', {
					name: me.user.name,
					role: t(`roles.${me.member.role}`),
					operator: me.impersonation.operatorEmail,
				})}
			</span>
			<Button
				size="sm"
				variant="outline"
				onClick={async () => {
					const res = await authClient.$fetch<{ url: string }>('/impersonation/stop', { method: 'POST', body: {} })
					window.location.assign(res.data?.url ?? '/')
				}}
				data-testid="impersonation-stop"
			>
				{t('impersonation.stop')}
			</Button>
		</div>
	)
}
