import { describe, expect, it } from 'vitest'
import { collectRouters, defineModule } from './module.ts'
import { definePermissions } from './permissions.ts'

describe('модули', () => {
	it('разрешения модуля должны быть объявлены под его именем', () => {
		expect(() =>
			defineModule({ name: 'courses', router: {}, permissions: definePermissions('lessons', { read: [] }) }),
		).toThrow(/разрешения объявлены для «lessons»/)
	})

	it('один namespace контракта — только в одном модуле', () => {
		const a = defineModule({ name: 'a', router: { shared: {} }, permissions: definePermissions('a', {}) })
		const b = defineModule({ name: 'b', router: { shared: {} }, permissions: definePermissions('b', {}) })
		expect(() => collectRouters({ a, b })).toThrow(/«shared» объявлен в двух модулях/)
	})
})
