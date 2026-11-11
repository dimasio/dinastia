// Журнал действий (скилл security-baseline): ctx.audit пишет строку в транзакции запроса или задачи — откат
// транзакции отменяет и запись. Журнал не редактируется и не удаляется.
import type { Tx } from '../db/client.ts'
import { auditLog } from './schema.ts'

/** `<модуль>.<сущность>.<действие>` в kebab-case. */
export const AUDIT_ACTION = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/

export interface AuditEntry {
	/** Сущность (`member`, `invitation`) и её id. */
	entity: string
	id: string
	/** Что изменилось — без ПДн и секретов: `{ role: { from: 'teacher', to: 'admin' } }`. */
	diff?: Record<string, unknown>
}

export type Audit = (action: string, entry: AuditEntry) => Promise<void>

/** Кто действует: участник школы (запрос) или система (задача, вебхук). */
export interface AuditActor {
	memberId: string | null
	/** Оператор Dinastia: вход от имени участника (5.6г). */
	operatorId?: string | null
	requestId?: string | null
	ip?: string | null
}

export function auditFor(tx: Tx, actor: AuditActor): Audit {
	return async (action, { entity, id, diff }) => {
		if (!AUDIT_ACTION.test(action)) throw new Error(`журнал: действие «${action}» — <модуль>.<сущность>.<действие>`)
		await tx.insert(auditLog).values({
			actorMemberId: actor.memberId,
			actorOperatorId: actor.operatorId ?? null,
			action,
			entity,
			entityId: id,
			diff: diff ?? null,
			requestId: actor.requestId ?? null,
			ip: actor.ip ?? null,
		})
	}
}
