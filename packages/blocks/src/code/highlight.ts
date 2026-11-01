// Подсветка кода (D-055): ядро highlight.js и только языки блока — не весь пакет (~1 МБ). Вывод highlight.js
// разбирается в дерево узлов и рисуется React-элементами — без innerHTML; цвета — классы Tailwind в viewer.tsx.
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import css from 'highlight.js/lib/languages/css'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import python from 'highlight.js/lib/languages/python'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import type { CODE_LANGUAGES } from './definition.ts'

hljs.registerLanguage('bash', bash)
hljs.registerLanguage('css', css)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('json', json)
hljs.registerLanguage('python', python)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('xml', xml)

/** Узел подсветки: текст или span с классом highlight.js (без HTML на странице — скилл security-baseline). */
export type CodeNode = string | { className: string; children: CodeNode[] }

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#x27;': "'" }
const decode = (s: string) => s.replace(/&(?:amp|lt|gt|quot|#x27);/g, (e) => ENTITIES[e] ?? e)

/**
 * Разбор вывода highlight.js в дерево: он состоит только из `<span class="hljs-…">`, `</span>` и экранированного
 * текста. Всё прочее (не бывает: текст кода экранирован) осталось бы текстом — разметка в DOM не попадает.
 */
function parse(html: string): CodeNode[] {
	const root: CodeNode[] = []
	const stack: { children: CodeNode[] }[] = [{ children: root }]
	for (const m of html.matchAll(/<span class="([\w\- ]+)">|<\/span>|[^<]+|</g)) {
		const top = stack.at(-1) as { children: CodeNode[] }
		if (m[1] !== undefined) {
			const node = { className: m[1], children: [] as CodeNode[] }
			top.children.push(node)
			stack.push(node)
		} else if (m[0] === '</span>') {
			if (stack.length > 1) stack.pop()
		} else top.children.push(decode(m[0]))
	}
	return root
}

/** Подсвеченный код деревом узлов; обычный текст — одним узлом. */
export function highlight(code: string, language: (typeof CODE_LANGUAGES)[number]): CodeNode[] {
	if (language === 'plaintext') return [code]
	return parse(hljs.highlight(code, { language: language === 'html' ? 'xml' : language, ignoreIllegals: true }).value)
}
