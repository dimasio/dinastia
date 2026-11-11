// Все таблицы приложения — для drizzle-kit (миграции) и типизированного клиента. Модуль добавляет строку экспорта.
export * from '@dinastia/blocks/tables'
export {
	appUser,
	blockState,
	lessonBlocks,
	questionItemKind,
	questionItems,
	questionScoring,
	questions,
	schoolStatus,
	schools,
} from '@dinastia/db'
export * from './kernel/audit/schema.ts'
export * from './kernel/auth/schema.ts'
export * from './kernel/exports/schema.ts'
export * from './kernel/members/schema.ts'
export * from './kernel/rate-limit/schema.ts'
export * from './kernel/storage/schema.ts'
export * from './kernel/webhooks/schema.ts'
export * from './modules/assessments/schema.ts'
export * from './modules/courses/schema.ts'
export * from './modules/learning/schema.ts'
export * from './modules/schools/schema.ts'
// gen:module:schema
