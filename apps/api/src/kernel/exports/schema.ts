import { opaqueJson, tenantTable } from '@dinastia/db'
import { index, integer, pgEnum, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const EXPORT_STATUSES = ['pending', 'ready', 'failed'] as const
export const exportStatus = pgEnum('export_status', EXPORT_STATUSES)

/**
 * Выгрузка таблицы в xlsx (скилл documents, карточка 4.6): запрос ставит задачу `exports.run`, задача пишет файл и отмечает
 * `ready`. `params` — параметры, проверенные в запросе (`defineExport.prepare`: права и область сотрудника); задача им доверяет.
 * Через `expires_at` строка и файл удаляются задачей `exports.cleanup`.
 */
export const exports = tenantTable(
	'exports',
	{
		/** Ключ определения (`defineExport`): `<модуль>.<выгрузка>`. */
		key: text('key').notNull(),
		/** Непрозрачно для запросов: читает только задача (D-032). */
		params: opaqueJson('params').notNull(),
		status: exportStatus('status').notNull().default('pending'),
		/** Кто запросил: только он получает ссылку. Без внешнего ключа — как `files.owner_member_id`. */
		requestedByMemberId: uuid('requested_by_member_id').notNull(),
		/** Готовый файл (`files`, назначение `exports.file`). */
		fileId: uuid('file_id'),
		rows: integer('rows').notNull().default(0),
		finishedAt: timestamp('finished_at', { withTimezone: true }),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	},
	(t) => [index().on(t.schoolId, t.expiresAt)],
)
