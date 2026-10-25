// Отладка задач (скилл background-jobs):
//   pnpm jobs:list                                            — очереди: ждут / выполняются / всего
//   pnpm jobs:run <имя> [--school <slug>] [--data '{…}']      — выполнить задачу сейчас, в этом процессе
import { schools } from '@dinastia/db'
import { eq } from 'drizzle-orm'
import { boss, stopBoss } from './kernel/boss.ts'
import { db, pool } from './kernel/db/client.ts'
import { allJobs, jobByName } from './kernel/registry.ts'
import { runJob } from './kernel/worker-runtime.ts'
import './modules/index.ts'

const [command, name] = process.argv.slice(2)
const opt = (key: string) => {
	const i = process.argv.indexOf(`--${key}`)
	return i > 0 ? process.argv[i + 1] : undefined
}

try {
	if (command === 'list') {
		if (!allJobs().length) console.log('задач нет — модули ещё не объявили jobs/subscribers')
		const queues = new Map((await (await boss()).getQueues()).map((q) => [q.name, q]))
		for (const job of allJobs()) {
			const q = queues.get(job.name)
			console.log(
				`${job.name.padEnd(40)} ${job.schedule ? `cron ${job.schedule}`.padEnd(20) : ''.padEnd(20)} ждут ${q?.queuedCount ?? 0}, выполняются ${q?.activeCount ?? 0}, всего ${q?.totalCount ?? 0}`,
			)
		}
	} else if (command === 'run' && name) {
		const job = jobByName(name)
		if (!job) throw new Error(`нет задачи «${name}»; список — pnpm jobs:list`)
		const slug = opt('school')
		const [school] = slug ? await db.select().from(schools).where(eq(schools.slug, slug)).limit(1) : []
		if (slug && !school) throw new Error(`нет школы «${slug}»`)
		await runJob(
			job,
			{ ...(school ? { schoolId: school.id } : {}), data: JSON.parse(opt('data') ?? '{}') },
			{ jobId: 'cli' },
		)
		console.log(`${name} — выполнена`)
	} else {
		throw new Error("использование: pnpm jobs:list | pnpm jobs:run <имя> [--school <slug>] [--data '{…}']")
	}
} finally {
	await stopBoss()
	await pool.end()
}
