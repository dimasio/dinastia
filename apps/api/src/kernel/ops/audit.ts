// Запись в журнал консоли оператора (`ops_audit`, 5.6).
import { AUDIT_ACTION } from '../audit/audit.ts'
import type { Tx } from '../db/client.ts'
import { opsAudit } from './schema.ts'

export async function opsAuditWrite(
	tx: Pick<Tx, 'insert'>,
	entry: {
		operatorId: string
		action: string
		schoolId?: string | null
		target?: string | null
		diff?: Record<string, unknown>
		ip: string | null
	},
) {
	if (!AUDIT_ACTION.test(entry.action))
		throw new Error(`журнал консоли: действие «${entry.action}» — <модуль>.<сущность>.<действие>`)
	await tx.insert(opsAudit).values({
		operatorId: entry.operatorId,
		action: entry.action,
		schoolId: entry.schoolId ?? null,
		target: entry.target ?? null,
		diff: entry.diff ?? null,
		ip: entry.ip,
	})
}
