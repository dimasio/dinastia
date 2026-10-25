// Реестр модулей (скилл module). Новый модуль — `pnpm gen:module <имя>` добавит строки у маркеров gen:module.

import { mailSendJob } from '#/kernel/mail/send.ts'
import { collectJobs } from '#/kernel/module.ts'
import { registerEmails, registerJobs } from '#/kernel/registry.ts'
import schools from './schools/index.ts'
// gen:module:import

export const modules = {
	schools,
	// gen:module:entry
}

// Задачи, подписчики и письма модулей — в реестр ядра (воркер, ctx.emit, ctx.mail); задачи ядра — тоже.
const { jobs, subscribers } = collectJobs(modules)
registerJobs([mailSendJob, ...jobs], subscribers)
registerEmails(Object.values(modules).flatMap((m) => m.emails ?? []))
