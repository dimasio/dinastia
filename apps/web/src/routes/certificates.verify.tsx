import { createFileRoute, redirect } from '@tanstack/react-router'
import { currentHost } from '#/app/host.ts'
import { Centered } from '#/app/layout/centered.tsx'
import { searchString } from '#/app/search.ts'
import { VerifyPage } from '#/features/certificates/verify-page.tsx'

// Проверка сертификата по номеру (карточка 4.7): публичная страница школы; ссылка из QR — с кодом.
export const Route = createFileRoute('/certificates/verify')({
	validateSearch: (s: Record<string, unknown>): { number?: string | undefined; code?: string | undefined } => ({
		number: searchString(s.number, 80),
		code: searchString(s.code, 16),
	}),
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
