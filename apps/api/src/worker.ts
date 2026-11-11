// Воркер фоновых задач (скилл background-jobs): отдельный процесс, в проде масштабируется отдельно от API.
// Локально `pnpm dev` запускает его вместе с API (src/dev.ts).
import { workerBoss } from './kernel/boss.ts'
import { closeBrowser } from './kernel/documents/pdf.ts'
import { log } from './kernel/log.ts'
import { allJobs } from './kernel/registry.ts'
import { startWorkers } from './kernel/worker-runtime.ts'
import './modules/index.ts'

const boss = workerBoss()
boss.on('error', (err) => log.error({ err }, 'pg-boss error'))
await boss.start()
await startWorkers(boss)
log.info({ queues: allJobs().length }, 'worker started')

const shutdown = async () => {
	await boss.stop({ graceful: true, timeout: 30_000 })
	await closeBrowser()
	process.exit(0)
}
process.once('SIGTERM', shutdown)
process.once('SIGINT', shutdown)
