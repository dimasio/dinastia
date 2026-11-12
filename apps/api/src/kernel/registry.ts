// Реестр приложения: задачи (модулей, подписчиков, ядра), письма, назначения файлов и обработчики вебхуков. Заполняет modules/index.ts при импорте; читают
// воркер (очереди, расписания), ctx.emit (кому доставить событие), ctx.mail и задача mail.send (шаблон по ключу).
import type { AnyExport } from './exports/define.ts'
import type { AnyJob, SchoolJob } from './jobs.ts'
import type { AnyEmail } from './mail/define.tsx'
import type { EmailBrandProvider } from './module.ts'
import type { PersonalDataPart } from './personal-data/define.ts'
import type { AnySettingsDef } from './settings/settings.ts'
import type { FilePurpose } from './storage/files.ts'
import type { AnyWebhookHandler } from './webhooks/define.ts'

const jobs = new Map<string, AnyJob>()
const byEvent = new Map<string, SchoolJob[]>()

export function registerJobs(list: AnyJob[], subscribers: { event: string; job: SchoolJob }[]) {
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
export const subscribersOf = (event: string): SchoolJob[] => byEvent.get(event) ?? []

const emails = new Map<string, AnyEmail>()

export function registerEmails(list: AnyEmail[]) {
	for (const e of list) {
		if (emails.has(e.key) && emails.get(e.key) !== e) throw new Error(`письмо «${e.key}» объявлено дважды`)
		emails.set(e.key, e)
	}
}

export const allEmails = (): AnyEmail[] => [...emails.values()]
export const emailByKey = (key: string): AnyEmail | undefined => emails.get(key)

const purposes = new Map<string, FilePurpose>()

export function registerFilePurposes(list: FilePurpose[]) {
	for (const p of list) {
		if (purposes.has(p.key) && purposes.get(p.key) !== p)
			throw new Error(`назначение файла «${p.key}» объявлено дважды`)
		purposes.set(p.key, p)
	}
}

export const filePurpose = (key: string): FilePurpose | undefined => purposes.get(key)

const exportDefs = new Map<string, AnyExport>()

export function registerExports(list: AnyExport[]) {
	for (const e of list) {
		if (exportDefs.has(e.key) && exportDefs.get(e.key) !== e) throw new Error(`выгрузка «${e.key}» объявлена дважды`)
		exportDefs.set(e.key, e)
	}
}

export const exportByKey = (key: string): AnyExport | undefined => exportDefs.get(key)

const webhookHandlers = new Map<string, AnyWebhookHandler>()

export function registerWebhookHandlers(list: AnyWebhookHandler[]) {
	for (const h of list) {
		const key = `${h.provider}:${h.type}`
		if (webhookHandlers.has(key) && webhookHandlers.get(key) !== h)
			throw new Error(`обработчик вебхука «${key}» объявлен дважды`)
		webhookHandlers.set(key, h)
	}
}

export const webhookHandler = (provider: string, type: string): AnyWebhookHandler | undefined =>
	webhookHandlers.get(`${provider}:${type}`)

const settings = new Map<string, AnySettingsDef>()

export function registerSettings(list: AnySettingsDef[]) {
	for (const s of list) {
		if (settings.has(s.module) && settings.get(s.module) !== s)
			throw new Error(`настройки «${s.module}» объявлены дважды`)
		settings.set(s.module, s)
	}
}

/** Настройки всех модулей — экран /admin/settings и check:registries. */
export const allSettings = (): AnySettingsDef[] => [...settings.values()]

const personalData = new Map<string, PersonalDataPart>()

/** Части «данных человека» модулей (5.5): порядок — как в реестре модулей. */
export function registerPersonalData(list: { module: string; part: PersonalDataPart }[]) {
	for (const { module, part } of list) {
		if (personalData.has(module) && personalData.get(module) !== part)
			throw new Error(`данные человека модуля «${module}» объявлены дважды`)
		personalData.set(module, part)
	}
}

export const allPersonalData = (): { module: string; part: PersonalDataPart }[] =>
	[...personalData.entries()].map(([module, part]) => ({ module, part }))

let emailBrand: EmailBrandProvider | null = null

/** Оформление писем (5.9) — один поставщик на приложение (модуль schools). */
export function registerEmailBrand(list: EmailBrandProvider[]) {
	if (list.length > 1) throw new Error('оформление писем объявлено в двух модулях')
	emailBrand = list[0] ?? null
}

export const emailBrandProvider = (): EmailBrandProvider | null => emailBrand
