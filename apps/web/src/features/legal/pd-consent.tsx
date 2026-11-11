// Согласие на обработку ПДн школой (5.5, скилл personal-data): обязательный флажок перед присоединением к школе.
// Политика — своя ссылка школы или типовая на сайте школы (`/legal/privacy`).
import type { SchoolLegal } from '@dinastia/contracts/schools'
import { Trans, useTranslation } from 'react-i18next'

export function PdConsent({
	legal,
	checked,
	onChange,
}: {
	legal: SchoolLegal
	checked: boolean
	onChange: (v: boolean) => void
}) {
	useTranslation('common')
	const href = legal.privacyUrl ?? '/legal/privacy'
	return (
		<label className="flex items-start gap-3 text-sm" data-testid="pd-consent">
			<input
				type="checkbox"
				className="mt-0.5 size-4 shrink-0 accent-primary"
				checked={checked}
				onChange={(e) => onChange(e.target.checked)}
				data-testid="pd-consent-checkbox"
			/>
			<span className="text-muted-foreground">
				<Trans
					ns="common"
					i18nKey="legal.pdConsent"
					values={{ operator: legal.operator }}
					components={{
						policy: (
							// biome-ignore lint/a11y/useAnchorContent: текст ссылки подставляет Trans
							<a href={href} target="_blank" rel="noopener noreferrer" className="text-foreground underline" />
						),
					}}
				/>
			</span>
		</label>
	)
}
