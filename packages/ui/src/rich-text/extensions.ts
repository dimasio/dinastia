// Расширения Tiptap из профиля (скилл rich-text): что профиль не разрешает, того нет в схеме редактора — вставка
// из буфера это отбрасывает сама. Профили — @dinastia/contracts/common (RICH_TEXT_PROFILES).
import {
	HEADING_LEVELS,
	isAllowedHref,
	RICH_TEXT_COLORS,
	RICH_TEXT_PROFILES,
	type RichTextProfile,
} from '@dinastia/contracts/common'
import { type AnyExtension, Extension, mergeAttributes, Node } from '@tiptap/core'
import Highlight from '@tiptap/extension-highlight'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { TableKit } from '@tiptap/extension-table'
import { TextStyle } from '@tiptap/extension-text-style'
import { Placeholder } from '@tiptap/extensions'
import StarterKit from '@tiptap/starter-kit'

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		fileImage: { insertFileImage: (attrs: { fileId: string; alt?: string | null }) => ReturnType }
		textColor: { setTextColor: (color: string) => ReturnType; unsetTextColor: () => ReturnType }
	}
}

export interface RichTextExtensionOptions {
	placeholder?: string
	/** Адрес картинки по fileId (подписанная ссылка или превью только что загруженной). */
	resolveFile?: (fileId: string) => string | undefined
}

/** Картинка — только файл школы (`fileId`); внешние `<img src>` при вставке не распознаются. */
export const FileImage = Node.create<{ resolveFile?: RichTextExtensionOptions['resolveFile'] }>({
	name: 'image',
	group: 'block',
	atom: true,
	draggable: true,
	addOptions: () => ({}),
	addAttributes() {
		return {
			fileId: {
				default: null,
				parseHTML: (el) => el.getAttribute('data-file-id'),
				renderHTML: (a) => ({ 'data-file-id': a.fileId }),
			},
			alt: {
				default: null,
				parseHTML: (el) => el.getAttribute('alt'),
				renderHTML: (a) => (a.alt ? { alt: a.alt } : {}),
			},
		}
	},
	parseHTML: () => [{ tag: 'img[data-file-id]' }],
	renderHTML({ node, HTMLAttributes }) {
		const src = node.attrs.fileId ? this.options.resolveFile?.(node.attrs.fileId) : undefined
		return ['img', mergeAttributes(HTMLAttributes, src ? { src } : {}, { class: 'rt-image' })]
	},
	addCommands: () => ({
		insertFileImage:
			(attrs) =>
			({ commands }) =>
				commands.insertContent({ type: 'image', attrs: { fileId: attrs.fileId, alt: attrs.alt ?? null } }),
	}),
})

/** Цвет текста — только ключ палитры (класс `rt-color-<ключ>`), чужие `style="color"` при вставке не берутся. */
export const TextColor = Extension.create({
	name: 'textColor',
	addGlobalAttributes: () => [
		{
			types: ['textStyle'],
			attributes: {
				color: {
					default: null,
					parseHTML: (el) => {
						const c = el.getAttribute('data-color')
						return c && c in RICH_TEXT_COLORS ? c : null
					},
					renderHTML: (a) => (a.color ? { 'data-color': a.color, class: `rt-color-${a.color}` } : {}),
				},
			},
		},
	],
	addCommands: () => ({
		setTextColor:
			(color) =>
			({ chain }) =>
				chain().setMark('textStyle', { color }).run(),
		unsetTextColor:
			() =>
			({ chain }) =>
				chain().setMark('textStyle', { color: null }).removeEmptyTextStyle().run(),
	}),
})

export function richTextExtensions(profile: RichTextProfile, opts: RichTextExtensionOptions = {}): AnyExtension[] {
	const p = RICH_TEXT_PROFILES[profile]
	const nodes = new Set<string>(p.nodes)
	const marks = new Set<string>(p.marks)
	const on = <T>(enabled: boolean, config: T) => (enabled ? config : false)
	const list: AnyExtension[] = [
		StarterKit.configure({
			heading: on(nodes.has('heading'), { levels: [...HEADING_LEVELS] }),
			bulletList: on(nodes.has('bulletList'), {}),
			orderedList: on(nodes.has('orderedList'), {}),
			listItem: on(nodes.has('bulletList') || nodes.has('orderedList'), {}),
			listKeymap: on(nodes.has('bulletList') || nodes.has('orderedList'), {}),
			blockquote: on(nodes.has('blockquote'), {}),
			codeBlock: on(nodes.has('codeBlock'), {}),
			horizontalRule: on(nodes.has('horizontalRule'), {}),
			hardBreak: on(nodes.has('hardBreak'), {}),
			bold: on(marks.has('bold'), {}),
			italic: on(marks.has('italic'), {}),
			underline: on(marks.has('underline'), {}),
			strike: on(marks.has('strike'), {}),
			code: on(marks.has('code'), {}),
			link: on(marks.has('link'), {
				openOnClick: false,
				autolink: true,
				defaultProtocol: 'https',
				isAllowedUri: (url: string) => isAllowedHref(url),
				HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
			}),
		}),
	]
	if (nodes.has('taskList')) list.push(TaskList, TaskItem.configure({ nested: true }))
	if (nodes.has('table')) list.push(TableKit.configure({ table: { resizable: false } }))
	if (nodes.has('image')) list.push(FileImage.configure({ resolveFile: opts.resolveFile }))
	if (marks.has('highlight')) list.push(Highlight.configure({ multicolor: false }))
	if (marks.has('textStyle')) list.push(TextStyle, TextColor)
	if (opts.placeholder) list.push(Placeholder.configure({ placeholder: opts.placeholder }))
	return list
}
