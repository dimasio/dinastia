import type { MemberRole } from '@dinastia/contracts/schools'
import type { Permission } from '../permissions.ts'
import type { Tx } from './db/client.ts'
import type { Emit } from './events.ts'
import type { Jobs } from './jobs.ts'
import type { MailApi } from './mail/send.ts'

export type { Tx }

import type { Logger } from './log.ts'

/**
 * Контекст школы без пользователя — общий для процедуры и фоновой задачи (architecture §4). Сервис, которому не
 * нужен пользователь, принимает BaseCtx — тогда его можно вызвать и из задачи.
 */
export interface BaseCtx {
	/** Транзакция школы: RLS видит только её данные (скилл data-access). */
	db: Tx
	school: { id: string; slug: string; name: string }
	now: () => Date
	/** Логгер с requestId или job/jobId и schoolId — без ПДн в полях (скилл observability). */
	log: Logger
	/** Доменное событие: подписчики — задачами в этой же транзакции (откат — события не было; скилл events-automations). */
	emit: Emit
	/** Поставить фоновую задачу в этой же транзакции (скилл background-jobs). */
	jobs: Jobs
	/** Письмо из шаблона — задачей в этой же транзакции (скилл notifications). */
	mail: MailApi
}

/** Контекст запроса участника школы. */
export interface SchoolCtx extends BaseCtx {
	user: { id: string; email: string; name: string }
	member: { id: string; role: MemberRole }
	/** Есть ли у участника разрешение (скилл permissions) — для условной логики в сервисе. */
	can: (perm: Permission) => boolean
}
