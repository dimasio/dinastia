import { tenantTable } from '@dinastia/db'
import { index, integer, pgEnum, text, uuid } from 'drizzle-orm/pg-core'

export const fileStatus = pgEnum('file_status', ['pending', 'ready'])

/**
 * Файл школы в S3 (скилл files-media): объект `key` загружает клиент напрямую по presigned URL; `ready` — после
 * сверки размера и типа объекта. Сущности хранят `file_id`, не URL; читать — только по подписанной ссылке.
 */
export const files = tenantTable(
	'files',
	{
		/** `schools/<school_id>/<purpose>/<id>` — строит ядро. */
		key: text('key').notNull().unique(),
		/** Назначение (`defineFilePurpose`): лимиты, типы, право. */
		purpose: text('purpose').notNull(),
		/** Имя файла у пользователя — для скачивания (может содержать ПДн; в логи не пишется). */
		name: text('name').notNull(),
		mime: text('mime').notNull(),
		/** Байты; лимит назначения ≤ 2 ГБ. */
		size: integer('size').notNull(),
		/** Кто загрузил (участник школы). Без внешнего ключа: members ссылается на files (аватар) — цикл ссылок между
		 * таблицами ядра; владельца проверяет код (completeUpload, updateMyAvatar). */
		ownerMemberId: uuid('owner_member_id'),
		status: fileStatus('status').notNull().default('pending'),
	},
	(t) => [
		// очистка незавершённых загрузок
		index().on(t.schoolId, t.status, t.createdAt),
	],
)
