// Реестр модулей (скилл module). Новый модуль — `pnpm gen:module <имя>` добавит строки у маркеров gen:module.
import schools from './schools/index.ts'
// gen:module:import

export const modules = {
	schools,
	// gen:module:entry
}
