// Реестр модулей (скилл module). Новый модуль — `pnpm gen:module <имя>` добавит строки у маркеров gen:module.
import { collectJobs } from '#/kernel/module.ts'
import { registerJobs } from '#/kernel/registry.ts'
import schools from './schools/index.ts'
// gen:module:import

export const modules = {
	schools,
	// gen:module:entry
}

// Задачи и подписчики модулей — в реестр ядра (воркер, ctx.emit).
const { jobs, subscribers } = collectJobs(modules)
registerJobs(jobs, subscribers)
