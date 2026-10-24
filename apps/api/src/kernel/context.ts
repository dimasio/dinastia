import type { MemberRole } from '@dinastia/contracts/schools'
import type { Permission } from '../permissions.ts'
import type { Tx } from './db/client.ts'

/** Контекст запроса школы (architecture §4). Фаза 1 добавит emit, jobs; 0.9 — log. */
export interface SchoolCtx {
	db: Tx
	school: { id: string; slug: string; name: string }
	user: { id: string; email: string; name: string }
	member: { id: string; role: MemberRole }
	/** Есть ли у участника разрешение (скилл permissions) — для условной логики в сервисе. */
	can: (perm: Permission) => boolean
	now: () => Date
}
