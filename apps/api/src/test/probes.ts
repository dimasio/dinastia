// Пробные таблицы тестов ядра (скилл testing): строятся теми же хелперами, что и боевые, и создаются ОДИН раз —
// в global-setup после миграций. DDL во время прогона нельзя: тесты идут параллельно, и CREATE/DROP таблицы со
// ссылкой на schools взаимно блокируется с каскадным удалением школы в соседнем файле (deadlock).
import {
	appUser,
	blockChildTable,
	blockState,
	blockTable,
	lessonBlocks,
	schoolStatus,
	schools,
	settingsTable,
	tenantRef,
	tenantTable,
} from '@dinastia/db'
import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api'
import { boolean, integer, text, uuid } from 'drizzle-orm/pg-core'

/** Изоляция школ и составные ключи (kernel/db/tenant.test.ts). */
export const probeParents = tenantTable('kernel_probe_parents', { title: text('title').notNull() })
export const probeChildren = tenantTable('kernel_probe_children', { parentId: uuid('parent_id').notNull() }, (t) => [
	tenantRef(t, t.parentId, probeParents, 'cascade'),
])

/** Тип блока с дочерней таблицей и секретом (kernel/blocks/blocks.test.ts). */
export const probeBlock = blockTable('kernel_probe_cards', { shuffle: boolean('shuffle').notNull().default(false) })
export const probeBlockItems = blockChildTable(probeBlock, 'items', {
	front: text('front').notNull(),
	isCorrect: boolean('is_correct').notNull(),
})

/** Настройки модуля (kernel/settings/settings.test.ts). */
export const probeSettings = settingsTable('kernel_probe_settings', {
	selfEnroll: boolean('self_enroll').notNull().default(true),
	reminderHours: integer('reminder_hours').notNull().default(24),
})

/** SQL создания пробных таблиц поверх уже мигрированной схемы. */
export async function probeDdl(): Promise<string[]> {
	const base = { schools, schoolStatus, appUser, lessonBlocks, blockState }
	return generateMigration(
		generateDrizzleJson(base),
		generateDrizzleJson({ ...base, probeParents, probeChildren, probeBlock, probeBlockItems, probeSettings }),
	)
}
