import { pgRole } from 'drizzle-orm/pg-core'

/** Роль приложения: только DML, без BYPASSRLS (создаётся окружением, не миграциями — D-006). */
export const appUser = pgRole('app_user').existing()
