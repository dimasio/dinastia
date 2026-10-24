import { and, eq } from 'drizzle-orm'
import type { Tx } from '../db/client.ts'
import { members } from './schema.ts'

/** Активное членство пользователя в школе транзакции (RLS ограничивает школой транзакции). */
export async function findActiveMember(tx: Tx, userId: string) {
	const [m] = await tx
		.select({ id: members.id, role: members.role })
		.from(members)
		.where(and(eq(members.userId, userId), eq(members.status, 'active')))
		.limit(1)
	return m ?? null
}
