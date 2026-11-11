// Вкладка «Сертификат» курса (карточка 4.7): шаблон — выдавать или нет, вид (ориентация, заголовок, текст с подстановками,
// подписант, подпись, фон-бланк, номер и дата), предпросмотр (та же вёрстка, что у PDF); ниже — выданные сертификаты.
import {
	CERTIFICATE_BACKGROUND,
	CERTIFICATE_ORIENTATIONS,
	CERTIFICATE_SIGNATURE,
	type CertificateTemplateFields,
} from '@dinastia/contracts/certificates'
import {
	Button,
	Card,
	CardContent,
	Field,
	ImageInput,
	Input,
	PageHeader,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	Skeleton,
	toast,
} from '@dinastia/ui'
import { ResourcePage, type ResourceSearch } from '@dinastia/ui/resource'
import { RichTextEditor } from '@dinastia/ui/rich-text'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorText } from '#/app/errors.ts'
import { uploadFile } from '#/app/files.ts'
import { orpc } from '#/app/orpc.ts'
import { meQuery } from '#/app/queries.ts'
import { CourseTabs } from '../courses/course-tabs.tsx'
import { issuedResource } from './resources/issued.tsx'

export function CertificateTab(props: {
	courseId: string
	search: ResourceSearch
	onSearch: (s: ResourceSearch) => void
}) {
	const { courseId } = props
	const { data: me } = useQuery(meQuery())
	const canManage = me?.permissions.includes('certificates.manage') ?? false
	const resource = useMemo(() => issuedResource({ courseId }), [courseId])
	return (
		<div className="grid grid-cols-[minmax(0,1fr)] gap-6" data-testid="certificate-tab">
			<CourseTabs courseId={courseId} active="certificate" />
			{canManage && <TemplateForm courseId={courseId} />}
			<ResourcePage resource={resource} search={props.search} onSearch={props.onSearch} />
		</div>
	)
}

type Images = { signatureUrl: string | null; backgroundUrl: string | null }

function TemplateForm({ courseId }: { courseId: string }) {
	const { t } = useTranslation(['certificates', 'errors'])
	const qc = useQueryClient()
	const query = orpc.certificates.template.get.queryOptions({ input: { courseId } })
	const template = useQuery(query)
	const [value, setValue] = useState<CertificateTemplateFields | null>(null)
	const [images, setImages] = useState<Images>({ signatureUrl: null, backgroundUrl: null })
	const [preview, setPreview] = useState<string | null>(null)
	useEffect(() => {
		if (!template.data) return
		const { courseId: _, signatureUrl, backgroundUrl, ...fields } = template.data
		setValue(fields)
		setImages({ signatureUrl, backgroundUrl })
	}, [template.data])
	const save = useMutation({
		...orpc.certificates.template.save.mutationOptions(),
		onSuccess: (data) => {
			qc.setQueryData(query.queryKey, data)
			toast.success(t('template.saved'))
		},
		onError: (e) => toast.error(t(errorText(e), { ns: 'errors' })),
	})
	const showPreview = useMutation({
		...orpc.certificates.template.preview.mutationOptions(),
		onSuccess: (data) => setPreview(data.html),
		onError: (e) => toast.error(t(errorText(e), { ns: 'errors' })),
	})
	if (template.error)
		return (
			<p role="alert" className="text-destructive text-sm" data-testid="certificate-template-error">
				{t(errorText(template.error), { ns: 'errors' })}
			</p>
		)
	if (!value) return <Skeleton className="h-96 w-full" />
	const set = (patch: Partial<CertificateTemplateFields>) => setValue({ ...value, ...patch })
	const image = (kind: 'signature' | 'background') => {
		const spec = kind === 'signature' ? CERTIFICATE_SIGNATURE : CERTIFICATE_BACKGROUND
		const field = kind === 'signature' ? 'signatureFileId' : 'backgroundFileId'
		const url = kind === 'signature' ? 'signatureUrl' : 'backgroundUrl'
		return (
			<Field id={`certificate-${kind}`} label={t(`template.fields.${kind}`)} hint={t(`template.fields.${kind}Hint`)}>
				<ImageInput
					preview="wide"
					value={images[url]}
					name={t(`template.fields.${kind}`)}
					accept={spec.mime}
					maxSize={spec.maxSize}
					uploadLabel={t('template.upload')}
					upload={async (file, onProgress) => {
						const fileId = await uploadFile(spec.purpose, file, onProgress)
						set({ [field]: fileId })
						setImages({ ...images, [url]: URL.createObjectURL(file) })
					}}
					onRemove={async () => {
						set({ [field]: null })
						setImages({ ...images, [url]: null })
					}}
					errorText={(e) => t(errorText(e), { ns: 'errors' })}
					testId={`certificate-${kind}`}
				/>
			</Field>
		)
	}
	return (
		<Card>
			<CardContent className="grid gap-5">
				<PageHeader title={t('template.title')} description={t('template.description')} />
				<label className="flex items-start gap-2 text-sm">
					<input
						type="checkbox"
						className="mt-0.5"
						checked={value.enabled}
						onChange={(e) => set({ enabled: e.target.checked })}
						data-testid="certificate-enabled"
					/>
					<span>
						<span className="font-medium">{t('template.fields.enabled')}</span>
						<span className="block text-muted-foreground">{t('template.fields.enabledHint')}</span>
					</span>
				</label>
				<div className="grid gap-4 sm:grid-cols-2">
					<Field id="certificate-heading" label={t('template.fields.heading')}>
						<Input
							id="certificate-heading"
							value={value.heading}
							maxLength={120}
							onChange={(e) => set({ heading: e.target.value })}
							data-testid="certificate-heading"
						/>
					</Field>
					<Field id="certificate-orientation" label={t('template.fields.orientation')}>
						<Select
							value={value.orientation}
							onValueChange={(v) => set({ orientation: v as CertificateTemplateFields['orientation'] })}
						>
							<SelectTrigger id="certificate-orientation" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{CERTIFICATE_ORIENTATIONS.map((o) => (
									<SelectItem key={o} value={o}>
										{t(`template.values.orientation.${o}`)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>
				</div>
				<Field id="certificate-body" label={t('template.fields.body')} hint={t('template.fields.bodyHint')}>
					<RichTextEditor
						id="certificate-body"
						profile="compact"
						value={value.body}
						onChange={(body) => set({ body })}
						aria-label={t('template.fields.body')}
						testId="certificate-body"
					/>
				</Field>
				<div className="grid gap-4 sm:grid-cols-2">
					<Field
						id="certificate-signer"
						label={t('template.fields.signerName')}
						hint={t('template.fields.signerNameHint')}
					>
						<Input
							id="certificate-signer"
							value={value.signerName ?? ''}
							maxLength={120}
							onChange={(e) => set({ signerName: e.target.value || null })}
							data-testid="certificate-signer"
						/>
					</Field>
					<Field id="certificate-signer-title" label={t('template.fields.signerTitle')}>
						<Input
							id="certificate-signer-title"
							value={value.signerTitle ?? ''}
							maxLength={120}
							onChange={(e) => set({ signerTitle: e.target.value || null })}
							data-testid="certificate-signer-title"
						/>
					</Field>
				</div>
				<div className="grid gap-4 sm:grid-cols-2">
					{image('signature')}
					{image('background')}
				</div>
				<div className="grid gap-2">
					{(['showNumber', 'showDate'] as const).map((k) => (
						<label key={k} className="flex items-center gap-2 text-sm">
							<input
								type="checkbox"
								checked={value[k]}
								onChange={(e) => set({ [k]: e.target.checked })}
								data-testid={`certificate-${k}`}
							/>
							{t(`template.fields.${k}`)}
						</label>
					))}
				</div>
				<div className="flex flex-wrap gap-2">
					<Button
						onClick={() => save.mutate({ ...value, courseId })}
						disabled={save.isPending || !value.heading.trim()}
						data-testid="certificate-save"
					>
						{t('template.save')}
					</Button>
					<Button
						variant="outline"
						onClick={() => showPreview.mutate({ ...value, courseId })}
						disabled={showPreview.isPending || !value.heading.trim()}
						data-testid="certificate-preview"
					>
						<Eye />
						{t('template.preview.open')}
					</Button>
				</div>
			</CardContent>
			<Sheet open={preview !== null} onOpenChange={(open) => !open && setPreview(null)}>
				<SheetContent className="w-full sm:max-w-4xl">
					<SheetHeader>
						<SheetTitle>{t('template.preview.title')}</SheetTitle>
						<SheetDescription>{t('template.preview.description')}</SheetDescription>
					</SheetHeader>
					{preview && <PreviewFrame html={preview} landscape={value.orientation === 'landscape'} />}
				</SheetContent>
			</Sheet>
		</Card>
	)
}

/** Лист A4 в масштабе ширины контейнера: HTML сертификата в изолированном фрейме (без скриптов). */
function PreviewFrame({ html, landscape }: { html: string; landscape: boolean }) {
	const { t } = useTranslation('certificates')
	const box = useRef<HTMLDivElement>(null)
	const [scale, setScale] = useState(0.5)
	// A4 при 96 dpi
	const width = landscape ? 1123 : 794
	const height = landscape ? 794 : 1123
	useEffect(() => {
		const el = box.current
		if (!el) return
		const observer = new ResizeObserver(() => setScale(el.clientWidth / width))
		observer.observe(el)
		return () => observer.disconnect()
	}, [width])
	return (
		<div className="overflow-y-auto px-4 pb-4">
			<div ref={box} className="relative w-full overflow-hidden rounded border" style={{ height: height * scale }}>
				<iframe
					title={t('template.preview.title')}
					srcDoc={html}
					sandbox=""
					className="absolute top-0 left-0 origin-top-left border-0 bg-white"
					style={{ width, height, transform: `scale(${scale})` }}
					data-testid="certificate-preview-frame"
				/>
			</div>
		</div>
	)
}
