// Реестр модулей (скилл module). Новый модуль — `pnpm gen:module <имя>` добавит строки у маркеров gen:module.

import { mailSendJob } from '#/kernel/mail/send.ts'
import { collectJobs } from '#/kernel/module.ts'
import { requestLimitsCleanupJob } from '#/kernel/rate-limit/rate-limit.ts'
import { registerEmails, registerFilePurposes, registerJobs, registerWebhookHandlers } from '#/kernel/registry.ts'
import files from '#/kernel/storage/module.ts'
import { processWebhookJob } from '#/kernel/webhooks/receive.ts'
import schools from './schools/index.ts'
// gen:module:import

export const modules = {
	files, // модуль ядра: загрузка файлов (kernel/storage)
	schools,
	// gen:module:entry
}

// Задачи, подписчики, письма, назначения файлов и обработчики вебхуков модулей — в реестр ядра (воркер, ctx.emit,
// ctx.mail, ctx.files, webhooks.process).
const { jobs, subscribers } = collectJobs(modules)
registerJobs([mailSendJob, processWebhookJob, requestLimitsCleanupJob, ...jobs], subscribers)
registerEmails(Object.values(modules).flatMap((m) => m.emails ?? []))
registerFilePurposes(Object.values(modules).flatMap((m) => m.files ?? []))
registerWebhookHandlers(Object.values(modules).flatMap((m) => m.webhooks ?? []))
