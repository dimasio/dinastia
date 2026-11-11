import { createFileRoute } from '@tanstack/react-router'
import { Centered } from '#/app/layout/centered.tsx'
import { LegalPage } from '#/features/legal/legal-page.tsx'

export const Route = createFileRoute('/legal/privacy')({
	component: () => (
		<Centered>
			<LegalPage doc="privacy" />
		</Centered>
	),
})
