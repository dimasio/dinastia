// Доступность уроков (карточка 4.3): «через N дней» — от старта потока или зачисления, «с даты» — с полуночи по Москве.
import { describe, expect, it } from 'vitest'
import type { PublishedOutline } from '../courses/service.ts'
import { computeAccess, dripDateStart } from './access.ts'

const DAY = 24 * 60 * 60 * 1000
const lesson = (id: string, extra: Partial<PublishedOutline['sections'][0]['lessons'][0]> = {}) => ({
	id,
	title: id,
	accessMode: 'drip' as const,
	dripDays: null,
	dripDate: null,
	completionRule: 'view' as const,
	...extra,
})
const outline = (lessons: ReturnType<typeof lesson>[]): PublishedOutline => ({
	course: {
		id: 'c',
		title: 'Курс',
		status: 'published',
		defaultAccessMode: 'open',
		accessDays: null,
		completionThresholdPct: 100,
	},
	sections: [{ id: 's', title: 'Раздел', lessons }],
})

describe('расписание', () => {
	const now = new Date('2026-11-10T12:00:00Z')

	it('«через N дней» — от старта потока, если он есть, иначе от зачисления', () => {
		const o = outline([lesson('l1', { dripDays: 3 })])
		const enrolledAt = new Date(now.getTime() - DAY) // зачислен вчера
		expect(computeAccess(o, { enrolledAt }, new Map(), now)[0]?.status).toBe('locked')
		// поток стартовал 5 дней назад — урок уже открыт
		const groupStartsAt = new Date(now.getTime() - 5 * DAY)
		expect(computeAccess(o, { enrolledAt, groupStartsAt }, new Map(), now)[0]?.status).toBe('available')
		// поток стартует через 2 дня — откроется через 5
		const future = new Date(now.getTime() + 2 * DAY)
		expect(computeAccess(o, { enrolledAt, groupStartsAt: future }, new Map(), now)[0]?.lockedBy).toEqual({
			kind: 'date',
			at: new Date(future.getTime() + 3 * DAY),
		})
	})

	it('«с даты» — с 00:00 по Москве', () => {
		expect(dripDateStart('2026-11-11').toISOString()).toBe('2026-11-10T21:00:00.000Z')
		const o = outline([lesson('l1', { dripDate: '2026-11-11' })])
		const enrolledAt = new Date('2026-11-01T00:00:00Z')
		expect(computeAccess(o, { enrolledAt }, new Map(), new Date('2026-11-10T20:59:00Z'))[0]?.status).toBe('locked')
		expect(computeAccess(o, { enrolledAt }, new Map(), new Date('2026-11-10T21:00:00Z'))[0]?.status).toBe('available')
	})

	it('завершённый урок открыт при любом расписании', () => {
		const o = outline([lesson('l1', { dripDays: 30 })])
		const facts = new Map([['l1', { openedAt: now, completedAt: now }]])
		expect(computeAccess(o, { enrolledAt: now }, facts, now)[0]?.status).toBe('completed')
	})
})
