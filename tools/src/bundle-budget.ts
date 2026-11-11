// Бюджет размера веба (5.2, скилл performance): начальная загрузка — JS из index.html (вход и modulepreload), gzip. Запуск после
// сборки: `pnpm bundle:budget` (собирает веб и проверяет). Превышение — ошибка: найти, что попало в начальную загрузку (код
// экранов тянется в маршрут через beforeLoad/validateSearch, пакеты без `sideEffects: false`).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

/** Начальный JS для любой области (общий вход); бюджет `learn` из скилла — самый строгий. */
const INITIAL_BUDGET_KB = 200
/** Самый большой ленивый чанк (редактор rich text) — чтобы не разрастался незаметно. */
const LAZY_BUDGET_KB = 200

const dist = join(import.meta.dirname, '../../apps/web/dist')
const html = readFileSync(join(dist, 'index.html'), 'utf8')
const initial = [...new Set([...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1] as string))]
const gz = (file: string) => gzipSync(readFileSync(join(dist, file)), { level: 9 }).length / 1024

const initialKb = initial.reduce((sum, f) => sum + gz(f), 0)
const lazy = [...readFileSync(join(dist, '.vite/manifest.json'), 'utf8').matchAll(/"file": "(assets\/[^"]+\.js)"/g)]
	.map((m) => m[1] as string)
	.filter((f) => !initial.includes(f))
const largest = lazy.map((f) => ({ f, kb: gz(f) })).sort((a, b) => b.kb - a.kb)[0]

console.log(`начальный JS: ${initialKb.toFixed(1)} КБ gzip (бюджет ${INITIAL_BUDGET_KB}), файлов: ${initial.length}`)
if (largest)
	console.log(`самый большой ленивый чанк: ${largest.f} — ${largest.kb.toFixed(1)} КБ gzip (бюджет ${LAZY_BUDGET_KB})`)
const over = [
	...(initialKb > INITIAL_BUDGET_KB ? [`начальный JS ${initialKb.toFixed(1)} > ${INITIAL_BUDGET_KB} КБ`] : []),
	...(largest && largest.kb > LAZY_BUDGET_KB ? [`${largest.f} ${largest.kb.toFixed(1)} > ${LAZY_BUDGET_KB} КБ`] : []),
]
if (over.length) {
	console.error(`бюджет превышен: ${over.join('; ')}`)
	process.exit(1)
}
