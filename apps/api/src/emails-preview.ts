// pnpm emails:preview — HTML всех писем реестра по их examples в apps/api/.emails/ (открыть в браузере).
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderEmail } from './kernel/mail/define.tsx'
import { allEmails } from './kernel/registry.ts'
import './modules/index.ts'

const out = fileURLToPath(new URL('../.emails/', import.meta.url))
mkdirSync(out, { recursive: true })
const school = { name: 'Демо-школа', slug: 'demo' }

for (const email of allEmails()) {
	for (const [i, data] of email.examples.entries()) {
		const { subject, html, text } = await renderEmail(email, data, school)
		const file = `${out}${email.key}${email.examples.length > 1 ? `-${i + 1}` : ''}`
		writeFileSync(`${file}.html`, html)
		writeFileSync(`${file}.txt`, `Тема: ${subject}\n\n${text}\n`)
		console.log(`${subject}\n  ${file}.html`)
	}
}
process.exit(0)
