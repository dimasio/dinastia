import { createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'
import { currentHost } from '#/app/host.ts'
import { Centered } from '#/app/layout/centered.tsx'
import { VerifyPage } from '#/features/certificates/verify-page.tsx'

// Проверка сертификата по номеру (карточка 4.7): публичная страница школы; ссылка из QR — с кодом.
export const Route = createFileRoute('/certificates/verify')({
	validateSearch: z.object({ number: z.string().max(80).optional(), code: z.string().max(16).optional() }),
	beforeLoad: () => {
		if (currentHost().kind !== 'school') throw redirect({ to: '/' })
	},
	component: () => {
		const { number, code } = Route.useSearch()
		const navigate = Route.useNavigate()
		return (
			<Centered>
				<VerifyPage number={number} code={code} onCheck={(n) => navigate({ search: { number: n }, replace: true })} />
			</Centered>
		)
	},
})
