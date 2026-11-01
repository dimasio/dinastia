import { Button } from '@dinastia/ui'
import { Check, Copy } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { BlockViewerProps } from '../types.ts'
import type { code } from './definition.ts'
import { type CodeNode, highlight } from './highlight.ts'

/** Цвета подсветки (D-055): классы highlight.js → цвета Tailwind со светлым и тёмным вариантом. */
const TOKENS = [
	'[&_.hljs-comment]:text-muted-foreground [&_.hljs-comment]:italic [&_.hljs-quote]:text-muted-foreground',
	'[&_.hljs-keyword]:text-purple-700 dark:[&_.hljs-keyword]:text-purple-300 [&_.hljs-built_in]:text-purple-700 dark:[&_.hljs-built_in]:text-purple-300 [&_.hljs-selector-tag]:text-purple-700 dark:[&_.hljs-selector-tag]:text-purple-300',
	'[&_.hljs-string]:text-green-700 dark:[&_.hljs-string]:text-green-300 [&_.hljs-regexp]:text-green-700 dark:[&_.hljs-regexp]:text-green-300',
	'[&_.hljs-number]:text-orange-700 dark:[&_.hljs-number]:text-orange-300 [&_.hljs-literal]:text-orange-700 dark:[&_.hljs-literal]:text-orange-300',
	'[&_.hljs-title]:text-blue-700 dark:[&_.hljs-title]:text-blue-300 [&_.hljs-section]:text-blue-700 dark:[&_.hljs-section]:text-blue-300',
	'[&_.hljs-attr]:text-cyan-700 dark:[&_.hljs-attr]:text-cyan-300 [&_.hljs-attribute]:text-cyan-700 dark:[&_.hljs-attribute]:text-cyan-300 [&_.hljs-property]:text-cyan-700 dark:[&_.hljs-property]:text-cyan-300 [&_.hljs-variable]:text-cyan-700 dark:[&_.hljs-variable]:text-cyan-300',
	'[&_.hljs-name]:text-rose-700 dark:[&_.hljs-name]:text-rose-300 [&_.hljs-tag]:text-rose-700 dark:[&_.hljs-tag]:text-rose-300 [&_.hljs-type]:text-rose-700 dark:[&_.hljs-type]:text-rose-300',
].join(' ')

export default function CodeViewer({ data, testId }: BlockViewerProps<typeof code>) {
	const { t } = useTranslation('blocks')
	const [copied, setCopied] = useState(false)
	const nodes = useMemo(() => highlight(data.code, data.language), [data.code, data.language])
	if (!data.code.trim()) return null
	return (
		<figure
			className="relative overflow-hidden rounded-lg border bg-muted/50"
			data-testid={testId}
			data-language={data.language}
		>
			<figcaption className="flex items-center justify-between border-b px-3 py-1.5 text-muted-foreground text-xs">
				<span>{t(`code.languages.${data.language}`)}</span>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="h-7"
					onClick={async () => {
						await navigator.clipboard.writeText(data.code)
						setCopied(true)
						setTimeout(() => setCopied(false), 2000)
					}}
					data-testid={`${testId}-copy`}
				>
					{copied ? <Check aria-hidden /> : <Copy aria-hidden />}
					{copied ? t('code.copied') : t('code.copy')}
				</Button>
			</figcaption>
			<pre className="overflow-x-auto p-4 text-sm leading-relaxed">
				<code className={`font-mono ${TOKENS}`}>
					<Nodes nodes={nodes} />
				</code>
			</pre>
		</figure>
	)
}

function Nodes({ nodes }: { nodes: CodeNode[] }) {
	return nodes.map((node, i) =>
		typeof node === 'string' ? (
			node
		) : (
			<span key={i} className={node.className}>
				<Nodes nodes={node.children} />
			</span>
		),
	)
}
