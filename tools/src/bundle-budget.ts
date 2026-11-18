// Бюджет размера веба (5.2, скилл performance): начальная загрузка — JS из index.html (вход и modulepreload), gzip. Запуск после
// сборки: `pnpm bundle:budget` (собирает веб и проверяет). Превышение — ошибка: найти, что попало в начальную загрузку (код
// экранов тянется в маршрут через beforeLoad/validateSearch, пакеты без `sideEffects: false`).
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

/** Начальный JS для любой области (общий вход); бюджет `learn` из скилла — самый строгий. */
const INITIAL_BUDGET_KB = 200
/** Самый большой ленивый чанк (редактор rich text) — чтобы не разрастался незаметно. */
const LAZY_BUDGET_KB = 200
/**
 * Ленивые чанки со своим потолком — грузятся только по требованию и не уменьшаются без потери функции. Чанк — по началу
 * имени файла (`assets/<имя>-<хеш>.js`).
 */
const LAZY_EXCEPTIONS_KB: Record<string, number> = {
	// просмотр презентации в теме (D-070): pptx-preview с echarts для диаграмм — только когда открыта презентация
	pptx: 400,
}
const chunkName = (f: string) => f.replace(/^assets\//, '').replace(/-[\w-]{8}\.js$/, '')

const dist = join(import.meta.dirname, '../../apps/web/dist')
const html = readFileSync(join(dist, 'index.html'), 'utf8')
const initial = [...new Set([...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1] as string))]
const gz = (file: string) => gzipSync(readFileSync(join(dist, file)), { level: 9 }).length / 1024

const initialKb = initial.reduce((sum, f) => sum + gz(f), 0)
const lazy = readdirSync(join(dist, 'assets'))
	.filter((f) => f.endsWith('.js'))
	.map((f) => `assets/${f}`)
	.filter((f) => !initial.includes(f))
const sized = lazy.map((f) => ({ f, kb: gz(f), limit: LAZY_EXCEPTIONS_KB[chunkName(f)] }))
const largest = sized.filter((c) => c.limit === undefined).sort((a, b) => b.kb - a.kb)[0]
const exceptions = sized.filter((c) => c.limit !== undefined)

console.log(`начальный JS: ${initialKb.toFixed(1)} КБ gzip (бюджет ${INITIAL_BUDGET_KB}), файлов: ${initial.length}`)
if (largest)
	console.log(`самый большой ленивый чанк: ${largest.f} — ${largest.kb.toFixed(1)} КБ gzip (бюджет ${LAZY_BUDGET_KB})`)
for (const c of exceptions)
	console.log(`ленивый чанк-исключение: ${c.f} — ${c.kb.toFixed(1)} КБ gzip (потолок ${c.limit})`)
const over = [
	...(initialKb > INITIAL_BUDGET_KB ? [`начальный JS ${initialKb.toFixed(1)} > ${INITIAL_BUDGET_KB} КБ`] : []),
	...(largest && largest.kb > LAZY_BUDGET_KB ? [`${largest.f} ${largest.kb.toFixed(1)} > ${LAZY_BUDGET_KB} КБ`] : []),
	...exceptions.filter((c) => c.kb > (c.limit as number)).map((c) => `${c.f} ${c.kb.toFixed(1)} > ${c.limit} КБ`),
]
if (over.length) {
	console.error(`бюджет превышен: ${over.join('; ')}`)
	process.exit(1)
}
