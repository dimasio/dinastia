// Реестр задач приложения: задачи модулей и задачи подписчиков. Заполняет modules/index.ts (collectJobs) при импорте;
// читают воркер (очереди, расписания) и ctx.emit (кому доставить событие).
import type { AnyJob } from './jobs.ts'

const jobs = new Map<string, AnyJob>()
const byEvent = new Map<string, AnyJob[]>()

export function registerJobs(list: AnyJob[], subscribers: { event: string; job: AnyJob }[]) {
	for (const job of list) {
		if (jobs.has(job.name) && jobs.get(job.name) !== job) throw new Error(`задача «${job.name}» объявлена дважды`)
		jobs.set(job.name, job)
	}
	for (const { event, job } of subscribers) {
		const list = byEvent.get(event) ?? []
		if (!list.includes(job)) byEvent.set(event, [...list, job])
	}
}

export const allJobs = (): AnyJob[] => [...jobs.values()]
export const jobByName = (name: string): AnyJob | undefined => jobs.get(name)
export const subscribersOf = (event: string): AnyJob[] => byEvent.get(event) ?? []
