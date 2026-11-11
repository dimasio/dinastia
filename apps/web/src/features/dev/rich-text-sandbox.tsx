// Песочница rich text (пункт 1.12) — содержимое маршрута /dev/rich-text отдельным модулем: zod и ресурс-фреймворк не попадают
// в начальную загрузку (5.2).
import { RichText, type RichTextDoc, richTextIssues, toPlainText } from '@dinastia/contracts/common'
import { PageHeader } from '@dinastia/ui'
import { ResourceForm, ResourceProvider } from '@dinastia/ui/resource'
import { RichTextView } from '@dinastia/ui/rich-text'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

const form = {
	schema: z.object({ title: z.string().trim().min(1).max(200), description: RichText }),
}

export function Sandbox() {
	const { t } = useTranslation()
	const [result, setResult] = useState<{ title: string; description: RichTextDoc } | null>(null)
	const issues = result ? richTextIssues(result.description, 'lesson') : []
	return (
		<main className="mx-auto grid max-w-3xl gap-6 p-4 sm:p-8">
			<PageHeader title={t('devSandbox.title')} description={t('devSandbox.description')} />
			<ResourceProvider viewer={{ memberId: 'dev', role: 'owner', permissions: [] }} errorText={String}>
				<ResourceForm
					ns="common"
					resourceKey="devSandbox"
					form={form}
					defaultValues={{ title: '', description: { type: 'doc', content: [{ type: 'paragraph' }] } }}
					submitLabel={t('devSandbox.submit')}
					onSubmit={async (values) => setResult(values as never)}
					testId="sandbox"
				/>
			</ResourceProvider>
			{result && (
				<section className="grid gap-3" data-testid="sandbox-result">
					<h2 className="font-semibold">{t('devSandbox.result')}</h2>
					<p data-testid="sandbox-verdict">
						{issues.length === 0 ? t('devSandbox.accepted') : t('devSandbox.rejected')}
					</p>
					<div data-testid="sandbox-view">
						<RichTextView doc={result.description} className="rounded-md border p-4" />
					</div>
					<h3 className="font-medium">{t('devSandbox.plain')}</h3>
					<pre className="whitespace-pre-wrap rounded-md bg-muted p-3 text-sm" data-testid="sandbox-plain">
						{toPlainText(result.description)}
					</pre>
				</section>
			)}
		</main>
	)
}
