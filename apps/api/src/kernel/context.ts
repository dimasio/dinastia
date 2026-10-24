import type { MemberRole } from '@dinastia/contracts/schools'
import type { Tx } from './db/client.ts'

/** Контекст запроса школы (architecture §4). Пункт 0.5 добавит can, emit, jobs, log. */
export interface SchoolCtx {
	db: Tx
	school: { id: string; slug: string; name: string }
	user: { id: string; email: string; name: string }
	member: { id: string; role: MemberRole }
	now: () => Date
}
