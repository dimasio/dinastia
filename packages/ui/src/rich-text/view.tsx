// Просмотр rich text без редактора (скилл rich-text): JSON → React-элементы, без innerHTML и без Tiptap в бандле.
import { isAllowedHref, RICH_TEXT_COLORS, type RichTextDoc, type RichTextNode } from '@dinastia/contracts/common'
import type { ReactNode } from 'react'
import { cn } from '#/lib/utils.ts'

export interface RichTextViewProps {
	doc: RichTextDoc | null | undefined
	/** Адрес картинки по fileId; нет адреса — картинка не показывается. */
	resolveFile?: (fileId: string) => string | undefined
	className?: string
}

type Mark = NonNullable<RichTextNode['marks']>[number]

function withMark(children: ReactNode, mark: Mark, key: number): ReactNode {
	switch (mark.type) {
		case 'bold':
			return <strong key={key}>{children}</strong>
		case 'italic':
			return <em key={key}>{children}</em>
		case 'underline':
			return <u key={key}>{children}</u>
		case 'strike':
			return <s key={key}>{children}</s>
		case 'code':
			return <code key={key}>{children}</code>
		case 'highlight':
			return <mark key={key}>{children}</mark>
		case 'link': {
			const href = mark.attrs?.href
			if (typeof href !== 'string' || !isAllowedHref(href)) return children
			return (
				<a key={key} href={href} target="_blank" rel="noopener noreferrer nofollow">
					{children}
				</a>
			)
		}
		case 'textStyle': {
			const color = mark.attrs?.color
			if (typeof color !== 'string' || !(color in RICH_TEXT_COLORS)) return children
			return (
				<span key={key} className={`rt-color-${color}`}>
					{children}
				</span>
			)
		}
		default:
			return children
	}
}

const align = (n: RichTextNode) =>
	['left', 'center', 'right'].includes(String(n.attrs?.align))
		? { textAlign: n.attrs?.align as 'left' | 'center' | 'right' }
		: undefined
const span = (v: unknown) => (Number.isInteger(v) && (v as number) > 1 ? (v as number) : undefined)

function render(n: RichTextNode, key: number, resolveFile: RichTextViewProps['resolveFile']): ReactNode {
	const kids = () => (n.content ?? []).map((c, i) => render(c, i, resolveFile))
	switch (n.type) {
		case 'text':
			return (n.marks ?? []).reduce<ReactNode>((acc, m, i) => withMark(acc, m, i), n.text ?? '')
		case 'paragraph':
			return <p key={key}>{kids()}</p>
		case 'heading': {
			const level = Number(n.attrs?.level)
			const Tag = level === 3 ? 'h3' : level === 4 ? 'h4' : 'h2'
			return <Tag key={key}>{kids()}</Tag>
		}
		case 'bulletList':
			return <ul key={key}>{kids()}</ul>
		case 'orderedList':
			return (
				<ol key={key} start={Number.isInteger(n.attrs?.start) ? (n.attrs?.start as number) : undefined}>
					{kids()}
				</ol>
			)
		case 'listItem':
			return <li key={key}>{kids()}</li>
		case 'taskList':
			return (
				<ul key={key} data-type="taskList">
					{kids()}
				</ul>
			)
		case 'taskItem':
			return (
				<li key={key} data-checked={n.attrs?.checked === true}>
					<input type="checkbox" checked={n.attrs?.checked === true} disabled readOnly aria-hidden />
					<div>{kids()}</div>
				</li>
			)
		case 'blockquote':
			return <blockquote key={key}>{kids()}</blockquote>
		case 'codeBlock':
			return (
				<pre key={key}>
					<code>{kids()}</code>
				</pre>
			)
		case 'horizontalRule':
			return <hr key={key} />
		case 'hardBreak':
			return <br key={key} />
		case 'image': {
			const fileId = n.attrs?.fileId
			const src = typeof fileId === 'string' ? resolveFile?.(fileId) : undefined
			if (!src) return null
			return <img key={key} className="rt-image" src={src} alt={typeof n.attrs?.alt === 'string' ? n.attrs.alt : ''} />
		}
		case 'table':
			return (
				<div key={key} className="rt-table">
					<table>
						<tbody>{kids()}</tbody>
					</table>
				</div>
			)
		case 'tableRow':
			return <tr key={key}>{kids()}</tr>
		case 'tableCell':
			return (
				<td key={key} colSpan={span(n.attrs?.colspan)} rowSpan={span(n.attrs?.rowspan)} style={align(n)}>
					{kids()}
				</td>
			)
		case 'tableHeader':
			return (
				<th key={key} colSpan={span(n.attrs?.colspan)} rowSpan={span(n.attrs?.rowspan)} style={align(n)}>
					{kids()}
				</th>
			)
		default:
			return null
	}
}

export function RichTextView({ doc, resolveFile, className }: RichTextViewProps) {
	return <div className={cn('rt', className)}>{(doc?.content ?? []).map((n, i) => render(n, i, resolveFile))}</div>
}
