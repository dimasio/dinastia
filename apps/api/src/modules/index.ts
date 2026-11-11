// Реестр модулей (скилл module). Новый модуль — `pnpm gen:module <имя>` добавит строки у маркеров gen:module.

import { magicLinkEmail } from '#/kernel/auth/magic-link-email.tsx'
import exportsModule from '#/kernel/exports/module.ts'
import { mailSendJob } from '#/kernel/mail/send.ts'
import { collectJobs } from '#/kernel/module.ts'
import { requestLimitsCleanupJob } from '#/kernel/rate-limit/rate-limit.ts'
import {
	registerEmails,
	registerExports,
	registerFilePurposes,
	registerJobs,
	registerPersonalData,
	registerSettings,
	registerWebhookHandlers,
} from '#/kernel/registry.ts'
import { deletionEmail } from '#/kernel/school-deletion/emails.tsx'
import { deletionNoticeJob, purgeSchoolsJob } from '#/kernel/school-deletion/school-deletion.ts'
import settingsModule from '#/kernel/settings/module.ts'
import files from '#/kernel/storage/module.ts'
import { processWebhookJob } from '#/kernel/webhooks/receive.ts'
import assessments from './assessments/index.ts'
import certificates from './certificates/index.ts'
import courses from './courses/index.ts'
import learning from './learning/index.ts'
import ops from './ops/index.ts'
import schools from './schools/index.ts'
// gen:module:import

export const modules = {
	files, // модуль ядра: загрузка файлов (kernel/storage)
	exports: exportsModule, // модуль ядра: выгрузки таблиц в xlsx (kernel/exports)
	settings: settingsModule, // модуль ядра: экран настроек школы (kernel/settings)
	schools,
	courses,
	learning,
	assessments,
	certificates,
	ops, // консоль оператора SaaS (5.6)
	// gen:module:entry
}

// Задачи, подписчики, письма, назначения файлов и обработчики вебхуков модулей — в реестр ядра (воркер, ctx.emit,
// ctx.mail, ctx.files, webhooks.process).
const { jobs, subscribers } = collectJobs(modules)
registerJobs(
	[mailSendJob, processWebhookJob, requestLimitsCleanupJob, deletionNoticeJob, purgeSchoolsJob, ...jobs],
	subscribers,
)
registerEmails([magicLinkEmail, deletionEmail, ...Object.values(modules).flatMap((m) => m.emails ?? [])])
registerFilePurposes(Object.values(modules).flatMap((m) => m.files ?? []))
registerExports(Object.values(modules).flatMap((m) => m.exports ?? []))
registerWebhookHandlers(Object.values(modules).flatMap((m) => m.webhooks ?? []))
registerSettings(Object.values(modules).flatMap((m) => (m.settings ? [m.settings] : [])))
registerPersonalData(
	Object.values(modules).flatMap((m) => (m.personalData ? [{ module: m.name, part: m.personalData }] : [])),
)
