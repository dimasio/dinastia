// Мини-разметка юридических текстов (5.5): заголовки `#`/`##`, абзацы, списки `-` и `1.` (продолжение — с отступом).
// Рендер — элементами React, без HTML из строки: текст подставляет реквизиты школы.
import type { ReactNode } from 'react'

type Node = { kind: 'h1' | 'h2' | 'p'; text: string } | { kind: 'ul' | 'ol'; items: string[] }

export function parseMarkdown(src: string): Node[] {
	const nodes: Node[] = []
	for (const chunk of src.trim().split(/\n\s*\n/)) {
		const lines = chunk.split('\n')
		const head = lines[0] ?? ''
		if (head.startsWith('## ')) nodes.push({ kind: 'h2', text: head.slice(3) })
		else if (head.startsWith('# ')) nodes.push({ kind: 'h1', text: head.slice(2) })
		else if (/^(- |\d+\. )/.test(head)) {
			const ordered = /^\d+\. /.test(head)
			const items: string[] = []
			for (const line of lines)
				if (/^(- |\d+\. )/.test(line)) items.push(line.replace(/^(- |\d+\. )/, ''))
				else items[items.length - 1] += ` ${line.trim()}`
			nodes.push({ kind: ordered ? 'ol' : 'ul', items })
		} else nodes.push({ kind: 'p', text: lines.map((l) => l.trim()).join(' ') })
	}
	return nodes
}

export function Markdown({ source }: { source: string }): ReactNode {
	return parseMarkdown(source).map((n, i) => {
		const key = `${n.kind}-${i}`
		switch (n.kind) {
			case 'h1':
				return (
					<h1 key={key} className="font-semibold text-2xl">
						{n.text}
					</h1>
				)
			case 'h2':
				return (
					<h2 key={key} className="mt-4 font-semibold text-lg">
						{n.text}
					</h2>
				)
			case 'p':
				return <p key={key}>{n.text}</p>
			case 'ul':
			case 'ol': {
				const List = n.kind
				return (
					<List key={key} className={`grid gap-1 pl-6 ${n.kind === 'ul' ? 'list-disc' : 'list-decimal'}`}>
						{n.items.map((item, j) => (
							<li key={j}>{item}</li>
						))}
					</List>
				)
			}
			default:
				return null
		}
	})
}
