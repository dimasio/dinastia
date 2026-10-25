// Реестр модулей (скилл module). Новый модуль — `pnpm gen:module <имя>` добавит строки у маркеров gen:module.

import { mailSendJob } from '#/kernel/mail/send.ts'
import { collectJobs } from '#/kernel/module.ts'
import { registerEmails, registerFilePurposes, registerJobs } from '#/kernel/registry.ts'
import files from '#/kernel/storage/module.ts'
import schools from './schools/index.ts'
// gen:module:import

export const modules = {
	files, // модуль ядра: загрузка файлов (kernel/storage)
	schools,
	// gen:module:entry
}

// Задачи, подписчики, письма и назначения файлов модулей — в реестр ядра (воркер, ctx.emit, ctx.mail, ctx.files).
const { jobs, subscribers } = collectJobs(modules)
registerJobs([mailSendJob, ...jobs], subscribers)
registerEmails(Object.values(modules).flatMap((m) => m.emails ?? []))
registerFilePurposes(Object.values(modules).flatMap((m) => m.files ?? []))
