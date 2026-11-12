// Вёрстка сертификата (скилл documents): один встроенный макет, поля — из шаблона курса. Лист A4 без полей; фон-бланк на весь
// лист; текст — HTML из rich text с подставленными значениями (`toHtml` экранирует); QR — SVG ссылки проверки.
import { createI18n } from '@dinastia/i18n'
import { z } from 'zod'
import { defineDocument } from '#/kernel/documents/define.ts'

const { t } = createI18n('ru')

export const CertificateData = z.object({
	orientation: z.enum(['landscape', 'portrait']),
	schoolName: z.string(),
	heading: z.string(),
	/** Готовый HTML текста (из `toHtml`). */
	bodyHtml: z.string(),
	signerName: z.string().nullable(),
	signerTitle: z.string().nullable(),
	/** `data:` URI в PDF, подписанная ссылка — в предпросмотре. */
	signatureSrc: z.string().nullable(),
	backgroundSrc: z.string().nullable(),
	/** Оформление школы (5.9): логотип (`data:` в PDF, ссылка в предпросмотре) и цвет рамки и заголовка. */
	logoSrc: z.string().nullable().default(null),
	brandColor: z.string().nullable().default(null),
	number: z.string().nullable(),
	date: z.string().nullable(),
	/** SVG QR-кода ссылки проверки. */
	qrSvg: z.string().nullable(),
	verifyUrl: z.string().nullable(),
})
export type CertificateData = z.infer<typeof CertificateData>

const INK = '#1f2937'
const MUTED = '#6b7280'

function Certificate({ d }: { d: CertificateData }) {
	const landscape = d.orientation === 'landscape'
	return (
		<div
			style={{
				position: 'relative',
				width: landscape ? '297mm' : '210mm',
				height: landscape ? '209.5mm' : '296.5mm',
				overflow: 'hidden',
				color: INK,
				fontFamily: "'PT Sans', sans-serif",
				...(d.backgroundSrc
					? { backgroundImage: `url("${d.backgroundSrc}")`, backgroundSize: '100% 100%' }
					: { background: '#fff' }),
			}}
		>
			{!d.backgroundSrc && (
				<div
					style={{
						position: 'absolute',
						inset: '10mm',
						border: `1.2mm double ${d.brandColor ?? '#9ca3af'}`,
						borderRadius: '2mm',
					}}
				/>
			)}
			<div
				style={{
					position: 'absolute',
					inset: landscape ? '24mm 30mm' : '30mm 22mm',
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					textAlign: 'center',
				}}
			>
				{d.logoSrc && (
					<img
						src={d.logoSrc}
						alt=""
						style={{ display: 'block', maxHeight: '16mm', maxWidth: '70mm', marginBottom: '4mm' }}
					/>
				)}
				<div style={{ fontSize: '11pt', letterSpacing: '0.12em', textTransform: 'uppercase', color: MUTED }}>
					{d.schoolName}
				</div>
				<h1
					style={{
						fontFamily: "'PT Serif', serif",
						fontSize: landscape ? '40pt' : '36pt',
						fontWeight: 700,
						margin: '10mm 0 8mm',
						...(d.brandColor ? { color: d.brandColor } : {}),
					}}
				>
					{d.heading}
				</h1>
				<div
					className="body"
					style={{ fontFamily: "'PT Serif', serif", fontSize: '15pt', lineHeight: 1.5, maxWidth: '200mm' }}
					// biome-ignore lint/security/noDangerouslySetInnerHtml: HTML из toHtml — текст экранирован, ссылки проверены
					dangerouslySetInnerHTML={{ __html: d.bodyHtml }}
				/>
				<div
					style={{
						marginTop: 'auto',
						width: '100%',
						display: 'flex',
						alignItems: 'flex-end',
						justifyContent: 'space-between',
						gap: '10mm',
						textAlign: 'left',
						fontSize: '10.5pt',
					}}
				>
					<div style={{ minWidth: '70mm' }}>
						{d.signatureSrc && (
							<img src={d.signatureSrc} alt="" style={{ display: 'block', maxHeight: '18mm', maxWidth: '55mm' }} />
						)}
						{(d.signerName || d.signerTitle) && (
							<div style={{ borderTop: `0.3mm solid ${MUTED}`, paddingTop: '1.5mm', minWidth: '60mm' }}>
								{d.signerName && <div style={{ fontWeight: 700 }}>{d.signerName}</div>}
								{d.signerTitle && <div style={{ color: MUTED }}>{d.signerTitle}</div>}
							</div>
						)}
					</div>
					<div style={{ display: 'flex', alignItems: 'flex-end', gap: '5mm' }}>
						<div style={{ textAlign: 'right' }}>
							{d.number && (
								<div>
									{t('certificates:pdf.number')} <b data-testid="number">{d.number}</b>
								</div>
							)}
							{d.date && (
								<div>
									{t('certificates:pdf.date')} {d.date}
								</div>
							)}
							{d.verifyUrl && <div style={{ color: MUTED, fontSize: '8.5pt' }}>{t('certificates:pdf.verify')}</div>}
						</div>
						{d.qrSvg && (
							<div
								style={{ width: '22mm', height: '22mm' }}
								// biome-ignore lint/security/noDangerouslySetInnerHtml: SVG собран uqr из ссылки проверки
								dangerouslySetInnerHTML={{ __html: d.qrSvg }}
							/>
						)}
					</div>
				</div>
			</div>
		</div>
	)
}

const bodyCss = `.body p { margin: 0 0 2mm } .body strong { font-weight: 700; font-size: 1.35em } .body h2, .body h3, .body h4 { margin: 0 0 2mm }
.body ul, .body ol { text-align: left; display: inline-block } svg { width: 100%; height: 100% }`

export const certificateDocument = defineDocument({
	key: 'certificates.certificate',
	schema: CertificateData,
	orientation: (d) => d.orientation,
	render: (d) => (
		<>
			<style>{bodyCss}</style>
			<Certificate d={d} />
		</>
	),
	example: {
		orientation: 'landscape',
		schoolName: 'Учебный центр «Пример»',
		heading: 'Сертификат',
		bodyHtml: '<p>Настоящий сертификат подтверждает, что</p><p><strong>Иван Петров</strong></p><p>прошёл обучение</p>',
		signerName: 'Анна Смирнова',
		signerTitle: 'Директор',
		signatureSrc: null,
		backgroundSrc: null,
		logoSrc: null,
		brandColor: '#4f46e5',
		number: 'PRIMER-2026-000001',
		date: '11 ноября 2026 г.',
		qrSvg: null,
		verifyUrl: null,
	},
})
