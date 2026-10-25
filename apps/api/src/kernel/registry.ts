// Реестр приложения: задачи (модулей, подписчиков, ядра) и письма. Заполняет modules/index.ts при импорте; читают
// воркер (очереди, расписания), ctx.emit (кому доставить событие), ctx.mail и задача mail.send (шаблон по ключу).
import type { AnyJob } from './jobs.ts'
import type { AnyEmail } from './mail/define.tsx'

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

const emails = new Map<string, AnyEmail>()

export function registerEmails(list: AnyEmail[]) {
	for (const e of list) {
		if (emails.has(e.key) && emails.get(e.key) !== e) throw new Error(`письмо «${e.key}» объявлено дважды`)
		emails.set(e.key, e)
	}
}

export const allEmails = (): AnyEmail[] => [...emails.values()]
export const emailByKey = (key: string): AnyEmail | undefined => emails.get(key)
