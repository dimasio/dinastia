// Модуль (скилл module): вертикальный срез — роутер (реализация своего контракта), разрешения, фоновые задачи,
// подписчики событий; далее настройки. Реестр модулей — src/modules/index.ts; роутер, права и задачи приложения
// собираются из него.

import type { Tx } from './db/client.ts'
import { type Subscriber, subscriberJob } from './events.ts'
import type { AnyExport } from './exports/define.ts'
import type { AnyJob, SchoolJob } from './jobs.ts'
import type { AnyEmail, EmailBrand } from './mail/define.tsx'
import type { ModulePermissions } from './permissions.ts'
import type { PersonalDataPart } from './personal-data/define.ts'
import type { AnySettingsDef } from './settings/settings.ts'
import type { FilePurpose } from './storage/files.ts'
import type { AnyWebhookHandler } from './webhooks/define.ts'

export interface ModuleDef<
	N extends string = string,
	R extends object = object,
	P extends ModulePermissions<string> = ModulePermissions<string>,
> {
	/** Имя модуля = папка modules/<name>; совпадает с префиксом разрешений. */
	name: N
	/** Процедуры по namespace контракта: { <namespace>: { <procedure>: … } }. */
	router: R
	permissions: P
	/** Фоновые задачи модуля (`modules/<m>/jobs.ts`); имя — `<модуль>.<действие>`. */
	jobs?: AnyJob[]
	/** Подписчики на события других модулей (`modules/<m>/events.ts`). */
	// biome-ignore lint/suspicious/noExplicitAny: у каждого события своя схема данных
	subscribers?: Subscriber<any>[]
	/** Шаблоны писем модуля (`modules/<m>/emails/*.tsx`); ключ — `<модуль>.<письмо>`. */
	emails?: AnyEmail[]
	/** Назначения файлов модуля (`defineFilePurpose`); ключ — `<модуль>.<назначение>`. */
	files?: FilePurpose[]
	/** Выгрузки таблиц в xlsx (`defineExport`, `modules/<m>/exports.ts`); ключ — `<модуль>.<выгрузка>`. */
	exports?: AnyExport[]
	/** Обработчики входящих вебхуков (`defineWebhookHandler`): провайдер + тип события. */
	webhooks?: AnyWebhookHandler[]
	/** Настройки школы модуля (`defineSettings`, таблица `<модуль>_settings`); экран /admin/settings строится из них. */
	settings?: AnySettingsDef
	/** Данные человека в модуле (`definePersonalData`): выгрузка по запросу и обезличивание участника (5.5). */
	personalData?: PersonalDataPart
	/** Оформление школы для писем (5.9): логотип и цвет кнопки; объявляет один модуль (schools). */
	emailBrand?: EmailBrandProvider
}

export type EmailBrandProvider = (tx: Tx, school: { id: string; slug: string }) => Promise<EmailBrand>

export function defineModule<const N extends string, R extends object, P extends ModulePermissions<string>>(
	def: ModuleDef<N, R, P>,
) {
	if (def.permissions.module !== def.name) {
		throw new Error(`модуль ${def.name}: разрешения объявлены для «${def.permissions.module}»`)
	}
	if (def.settings && def.settings.module !== def.name)
		throw new Error(`модуль ${def.name}: настройки объявлены для «${def.settings.module}»`)
	for (const f of def.files ?? [])
		if (!f.key.startsWith(`${def.name}.`))
			throw new Error(`модуль ${def.name}: назначение файла «${f.key}» чужого модуля`)
	for (const x of def.exports ?? [])
		if (!x.key.startsWith(`${def.name}.`)) throw new Error(`модуль ${def.name}: выгрузка «${x.key}» чужого модуля`)
	for (const e of def.emails ?? [])
		if (!e.key.startsWith(`${def.name}.`)) throw new Error(`модуль ${def.name}: письмо «${e.key}» чужого модуля`)
	for (const job of def.jobs ?? []) {
		if (!job.name.startsWith(`${def.name}.`)) throw new Error(`модуль ${def.name}: задача «${job.name}» чужого модуля`)
		if (job.scope === 'global') throw new Error(`модуль ${def.name}: задача «${job.name}» без школы — только в ядре`)
	}
	return def
}

type UnionToIntersection<U> = (U extends unknown ? (x: U) => void : never) extends (x: infer I) => void ? I : never
type Modules = Record<string, ModuleDef>

/** Роутер всех модулей (для impl.router) — namespace контракта не должен повторяться в двух модулях. */
export function collectRouters<M extends Modules>(modules: M): UnionToIntersection<M[keyof M]['router']> {
	const merged: Record<string, unknown> = {}
	for (const m of Object.values(modules)) {
		for (const [ns, procedures] of Object.entries(m.router)) {
			if (ns in merged) throw new Error(`namespace контракта «${ns}» объявлен в двух модулях`)
			merged[ns] = procedures
		}
	}
	return merged as UnionToIntersection<M[keyof M]['router']>
}

/** Задачи всех модулей и задачи подписчиков (`<модуль>.on.<событие>`); имя задачи не должно повторяться. */
export function collectJobs(modules: Modules) {
	const jobs: AnyJob[] = []
	const subscribers: { event: string; job: SchoolJob }[] = []
	for (const m of Object.values(modules)) {
		jobs.push(...(m.jobs ?? []))
		for (const s of m.subscribers ?? []) {
			const job = subscriberJob(m.name, s)
			jobs.push(job)
			subscribers.push({ event: s.event.name, job })
		}
	}
	const seen = new Set<string>()
	for (const j of jobs) {
		if (seen.has(j.name)) throw new Error(`задача «${j.name}» объявлена дважды (для двух подписок — key в on())`)
		seen.add(j.name)
	}
	return { jobs, subscribers }
}
