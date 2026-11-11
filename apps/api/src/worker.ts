// Воркер фоновых задач (скилл background-jobs): отдельный процесс, в проде масштабируется отдельно от API.
// Локально `pnpm dev` запускает его вместе с API (src/dev.ts).
import { workerBoss } from './kernel/boss.ts'
import { config } from './kernel/config.ts'
import { closeBrowser } from './kernel/documents/pdf.ts'
import { flushErrors, initErrorReporting } from './kernel/error-report.ts'
import { log } from './kernel/log.ts'
import { serveMetrics } from './kernel/metrics.ts'
import { registerCoreCollectors } from './kernel/metrics-collectors.ts'
import { allJobs } from './kernel/registry.ts'
import { startWorkers } from './kernel/worker-runtime.ts'
import './modules/index.ts'

initErrorReporting('worker')
if (config.METRICS_PORT) {
	registerCoreCollectors()
	serveMetrics(config.METRICS_PORT)
}

const boss = workerBoss()
boss.on('error', (err) => log.error({ err }, 'pg-boss error'))
await boss.start()
await startWorkers(boss)
log.info({ queues: allJobs().length }, 'worker started')

const shutdown = async () => {
	await boss.stop({ graceful: true, timeout: 30_000 })
	await closeBrowser()
	await flushErrors()
	process.exit(0)
}
process.once('SIGTERM', shutdown)
process.once('SIGINT', shutdown)
