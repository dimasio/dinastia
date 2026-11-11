// Метрики Prometheus (5.4, скилл observability): свой минимальный экспортёр — счётчики и гистограммы в текстовом формате (0.0.4);
// `prom-client` не выпускался с 2024-06. Отдаются на внутреннем порту `METRICS_PORT` (`serveMetrics`), наружу не публикуются.
// Метки — с малой кардинальностью: процедура, задача, код; без `schoolId` и id записей.
import { createServer } from 'node:http'

type Labels = Record<string, string>
type Collect = () => Promise<void> | void

const key = (labels: Labels) =>
	Object.entries(labels)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([k, v]) => `${k}="${v.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n')}"`)
		.join(',')

interface Metric {
	name: string
	help: string
	type: 'counter' | 'gauge' | 'histogram'
	render(): string[]
}

const metrics: Metric[] = []
const collectors: Collect[] = []

function register<M extends Metric>(m: M): M {
	if (metrics.some((x) => x.name === m.name)) throw new Error(`метрика «${m.name}» объявлена дважды`)
	metrics.push(m)
	return m
}

export function counter(name: string, help: string) {
	const values = new Map<string, number>()
	return register({
		name,
		help,
		type: 'counter' as const,
		inc(labels: Labels = {}, by = 1) {
			const k = key(labels)
			values.set(k, (values.get(k) ?? 0) + by)
		},
		render: () => [...values].map(([k, v]) => `${name}${k ? `{${k}}` : ''} ${v}`),
	})
}

export function gauge(name: string, help: string) {
	const values = new Map<string, number>()
	return register({
		name,
		help,
		type: 'gauge' as const,
		set(labels: Labels, value: number) {
			values.set(key(labels), value)
		},
		reset() {
			values.clear()
		},
		render: () => [...values].map(([k, v]) => `${name}${k ? `{${k}}` : ''} ${v}`),
	})
}

/** Длительности в секундах; корзины — от 5 мс до 10 с. */
export function histogram(
	name: string,
	help: string,
	buckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
) {
	const series = new Map<string, { counts: number[]; sum: number; count: number }>()
	return register({
		name,
		help,
		type: 'histogram' as const,
		observe(labels: Labels, seconds: number) {
			const k = key(labels)
			const s = series.get(k) ?? { counts: buckets.map(() => 0), sum: 0, count: 0 }
			buckets.forEach((b, i) => {
				if (seconds <= b) s.counts[i] = (s.counts[i] ?? 0) + 1
			})
			s.sum += seconds
			s.count++
			series.set(k, s)
		},
		render: () =>
			[...series].flatMap(([k, s]) => {
				const sep = k ? `${k},` : ''
				return [
					...buckets.map((b, i) => `${name}_bucket{${sep}le="${b}"} ${s.counts[i]}`),
					`${name}_bucket{${sep}le="+Inf"} ${s.count}`,
					`${name}_sum${k ? `{${k}}` : ''} ${s.sum}`,
					`${name}_count${k ? `{${k}}` : ''} ${s.count}`,
				]
			}),
	})
}

/** Значения, которые считаются при чтении (очередь задач, пул БД) — перед выдачей `/metrics`. */
export function onCollect(fn: Collect) {
	collectors.push(fn)
}

/** Текст для Prometheus. */
export async function renderMetrics(): Promise<string> {
	for (const c of collectors) await c()
	return `${metrics
		.flatMap((m) => {
			const lines = m.render()
			return lines.length ? [`# HELP ${m.name} ${m.help}`, `# TYPE ${m.name} ${m.type}`, ...lines] : []
		})
		.join('\n')}\n`
}

let server: ReturnType<typeof createServer> | null = null

/**
 * Отдельный HTTP-сервер `/metrics` на внутреннем порту — один на процесс (в production API и воркер — разные процессы, у каждого
 * свой; в `pnpm dev` они в одном процессе, и второй вызов ничего не делает).
 */
export function serveMetrics(port: number) {
	if (server) return server
	server = createServer(async (req, res) => {
		if (req.url !== '/metrics') {
			res.writeHead(404).end()
			return
		}
		try {
			res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4' }).end(await renderMetrics())
		} catch {
			res.writeHead(500).end()
		}
	})
	server.listen(port)
	return server
}

// ── Метрики ядра ────────────────────────────────────────────────────────────────────────────────────────────────────

export const rpcDuration = histogram('rpc_duration_seconds', 'Длительность процедур API')
export const rpcErrors = counter('rpc_errors_total', 'Ошибки процедур API по коду')
export const jobDuration = histogram('jobs_duration_seconds', 'Длительность выполнения задач')
export const jobFailures = counter('jobs_failed_total', 'Сбои задач (повтор и без повтора)')
