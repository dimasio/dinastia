import { opaqueJson, pii, tenantRef, tenantTable } from '@dinastia/db'
import { index, text, uuid } from 'drizzle-orm/pg-core'
import { members } from '../members/schema.ts'

/**
 * Журнал действий (D-021, скилл security-baseline): кто, что и с какой записью сделал. Только добавление —
 * у `app_user` нет UPDATE и DELETE (миграция 0003); строки уходят только вместе со школой.
 */
export const auditLog = tenantTable(
	'audit_log',
	{
		/** Участник школы; null — система (фоновая задача, вебхук). */
		actorMemberId: uuid('actor_member_id'),
		/** Действовал оператор Dinastia — от имени участника (5.6г) или из консоли. */
		actorOperatorId: uuid('actor_operator_id'),
		/** `<модуль>.<сущность>.<действие>`: `schools.member.role-changed`. */
		action: text('action').notNull(),
		/** Сущность и её id: `member`, `invitation`. */
		entity: text('entity').notNull(),
		entityId: uuid('entity_id').notNull(),
		/** Что изменилось: `{ role: { from, to } }` — без ПДн и секретов (D-032: непрозрачные данные). */
		diff: opaqueJson<Record<string, unknown>>('diff'),
		requestId: text('request_id'),
		ip: pii(text('ip')),
	},
	(t) => [
		tenantRef(t, t.actorMemberId, members, 'no action'),
		index().on(t.schoolId, t.actorMemberId),
		index().on(t.schoolId, t.createdAt),
		index().on(t.schoolId, t.entity, t.entityId),
	],
)
