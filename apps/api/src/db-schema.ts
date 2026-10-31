// Все таблицы приложения — для drizzle-kit (миграции) и типизированного клиента. Модуль добавляет строку экспорта.
export { appUser, schoolStatus, schools } from '@dinastia/db'
export * from './kernel/audit/schema.ts'
export * from './kernel/auth/schema.ts'
export * from './kernel/members/schema.ts'
export * from './kernel/storage/schema.ts'
export * from './kernel/webhooks/schema.ts'
export * from './modules/schools/schema.ts'
// gen:module:schema
