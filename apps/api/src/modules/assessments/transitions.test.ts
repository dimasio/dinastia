// Таблица переходов статусов сдачи (карточки 3.4, 4.3): допустимые и недопустимые, конечный статус, пересдача, кто что может.
import { describe, expect, it } from 'vitest'
import { AppError } from '#/kernel/errors.ts'
import { SUBMISSION_STATUSES } from './schema.ts'
import { type Actor, canTransition, isEditable, transition } from './transitions.ts'

const ACTORS: Actor[] = ['student', 'reviewer', 'system']
const code = (fn: () => unknown) => {
	try {
		fn()
		return 'ok'
	} catch (e) {
		return e instanceof AppError ? e.code : String(e)
	}
}

describe('переходы статусов сдачи', () => {
	it('допустимые: ученик отправляет черновик и доработку; проверяющий решает по отправленной', () => {
		expect(canTransition('draft', 'submitted', 'student')).toBe(true)
		expect(canTransition('needs_revision', 'submitted', 'student')).toBe(true)
		for (const to of ['accepted', 'needs_revision', 'rejected'] as const)
			expect(canTransition('submitted', to, 'reviewer')).toBe(true)
		expect(canTransition('submitted', 'accepted', 'system')).toBe(true) // автопринятие без проверки
	})

	it('недопустимые: ученик не принимает свою работу; проверяющий не отправляет; система не отклоняет', () => {
		expect(canTransition('submitted', 'accepted', 'student')).toBe(false)
		expect(canTransition('draft', 'submitted', 'reviewer')).toBe(false)
		expect(canTransition('submitted', 'rejected', 'system')).toBe(false)
		expect(canTransition('submitted', 'needs_revision', 'system')).toBe(false)
		expect(canTransition('draft', 'accepted', 'reviewer')).toBe(false) // минуя «отправлено»
		expect(canTransition('needs_revision', 'accepted', 'reviewer')).toBe(false)
	})

	it('accepted — конечный: из него нет ни одного перехода', () => {
		for (const to of SUBMISSION_STATUSES)
			for (const actor of ACTORS) expect(canTransition('accepted', to, actor)).toBe(false)
	})

	it('rejected — только пересдача решением проверяющего (4.3): → needs_revision', () => {
		for (const to of SUBMISSION_STATUSES)
			for (const actor of ACTORS)
				expect(canTransition('rejected', to, actor)).toBe(to === 'needs_revision' && actor === 'reviewer')
	})

	it('ни один статус не переходит сам в себя', () => {
		for (const s of SUBMISSION_STATUSES) for (const actor of ACTORS) expect(canTransition(s, s, actor)).toBe(false)
	})

	it('transition: новый статус или SUBMISSION_STATE', () => {
		expect(transition('draft', 'submitted', 'student')).toBe('submitted')
		expect(code(() => transition('accepted', 'submitted', 'student'))).toBe('SUBMISSION_STATE')
		expect(code(() => transition('submitted', 'accepted', 'student'))).toBe('SUBMISSION_STATE')
	})

	it('правит ученик только черновик и «нужна доработка»', () => {
		expect(SUBMISSION_STATUSES.filter(isEditable)).toEqual(['draft', 'needs_revision'])
	})
})
