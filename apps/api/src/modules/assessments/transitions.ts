// Переходы статусов сдачи (карточка 3.4, domain.md §3 «Домашнее задание»): единственное место, где они определены.
// Чистая функция — тестируется без БД. Статус меняют только через `transition`.
import { fail } from '#/kernel/errors.ts'
import type { SUBMISSION_STATUSES } from './schema.ts'

export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number]
/** Кто совершает переход: ученик, проверяющий или система (автопринятие, когда проверка не нужна). */
export type Actor = 'student' | 'reviewer' | 'system'

const TABLE: Readonly<Record<SubmissionStatus, readonly { to: SubmissionStatus; by: readonly Actor[] }[]>> = {
	draft: [{ to: 'submitted', by: ['student'] }],
	submitted: [
		{ to: 'accepted', by: ['reviewer', 'system'] },
		{ to: 'needs_revision', by: ['reviewer'] },
		{ to: 'rejected', by: ['reviewer'] },
	],
	needs_revision: [{ to: 'submitted', by: ['student'] }],
	accepted: [],
	// пересдача отклонённой — решением проверяющего (4.3, `allow_resubmit`)
	rejected: [{ to: 'needs_revision', by: ['reviewer'] }],
}

export const canTransition = (from: SubmissionStatus, to: SubmissionStatus, actor: Actor) =>
	TABLE[from].some((t) => t.to === to && t.by.includes(actor))

/** Правит ли ученик сдачу в этом статусе (черновик и «нужна доработка»). */
export const isEditable = (status: SubmissionStatus) => status === 'draft' || status === 'needs_revision'

/** Новый статус или `SUBMISSION_STATE`, если такого перехода нет. */
export function transition(from: SubmissionStatus, to: SubmissionStatus, actor: Actor): SubmissionStatus {
	if (!canTransition(from, to, actor)) return fail.conflict('SUBMISSION_STATE', { from, to })
	return to
}
