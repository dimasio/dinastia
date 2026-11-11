import { CommentText, RichText } from '@dinastia/contracts/common'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { action, defineResource, resourceSearch, toListInput } from './define.ts'
import { fieldsFromSchema } from './fields.ts'
import { resourceKeys } from './keys.ts'

const Email = z.string().trim().toLowerCase().pipe(z.email())

describe('поля формы из zod', () => {
	it('тип контрола, обязательность и варианты — из схемы, переопределения — из fields', () => {
		const schema = z.object({
			email: Email,
			role: z.enum(['admin', 'teacher']),
			active: z.boolean().default(true),
			seats: z.number().int().optional(),
			note: z.string().max(500).optional(),
		})
		const rows = fieldsFromSchema({ schema, fields: { note: { widget: 'textarea', hint: true } } })
		expect(rows.flat().map((f) => [f.name, f.widget, f.required])).toEqual([
			['email', 'email', true],
			['role', 'select', true],
			['active', 'switch', false],
			['seats', 'number', false],
			['note', 'textarea', false],
		])
		expect(rows[1]?.[0]?.options).toEqual(['admin', 'teacher'])
		expect(rows[4]?.[0]?.hint).toBe(true)
	})

	it('rich text — редактор с профилем схемы, в том числе необязательное поле', () => {
		const schema = z.object({ description: RichText, note: CommentText.nullable().optional(), title: z.string() })
		expect(
			fieldsFromSchema({ schema })
				.flat()
				.map((f) => [f.name, f.widget, f.richText ?? null, f.required]),
		).toEqual([
			['description', 'richtext', 'lesson', true],
			['note', 'richtext', 'comment', false],
			['title', 'input', null, true],
		])
	})

	it('layout задаёт строки; поля нет в схеме — ошибка сразу', () => {
		const schema = z.object({ first: z.string(), last: z.string(), email: Email })
		expect(fieldsFromSchema({ schema, layout: [['first', 'last'], ['email']] }).map((r) => r.length)).toEqual([2, 1])
		expect(() => fieldsFromSchema({ schema, layout: [['nope' as 'first']] })).toThrow(/nope/)
	})
})

describe('адрес → вход списка', () => {
	const def = {
		columns: [{ sort: 'name' }, {}, { sort: 'joinedAt' }],
		filters: [{ field: 'role', options: ['admin', 'teacher'] as const }],
		search: true,
	}

	it('берёт только сортировки колонок и допустимые значения фильтров', () => {
		expect(
			toListInput(def, {
				page: 2,
				q: '  ann ',
				sort: 'joinedAt',
				dir: 'desc',
				filters: { role: 'admin', status: 'blocked' },
			}),
		).toEqual({ page: 2, pageSize: 20, q: 'ann', sort: 'joinedAt', dir: 'desc', filters: { role: 'admin' } })
		expect(toListInput(def, { sort: 'email', filters: { role: 'owner' }, q: '  ' })).toEqual({
			page: 1,
			pageSize: 20,
		})
	})

	it('варианты из данных: значение сравнивается по value', () => {
		const byData = {
			columns: [],
			filters: [{ field: 'groupId', options: [{ value: 'g1', label: 'Поток 1' }, 'none'] }],
		}
		expect(toListInput(byData, { filters: { groupId: 'g1' } })).toEqual({
			page: 1,
			pageSize: 20,
			filters: { groupId: 'g1' },
		})
		expect(toListInput(byData, { filters: { groupId: 'none' } }).filters).toEqual({ groupId: 'none' })
		expect(toListInput(byData, { filters: { groupId: 'Поток 1' } }).filters).toBeUndefined()
	})

	it('битые параметры адреса не ломают экран', () => {
		expect(resourceSearch({ page: 'abc', dir: 'up', q: 'x', filters: 5 })).toEqual({ q: 'x' })
		expect(resourceSearch({ page: '3' })).toEqual({ page: 3 })
	})
})

describe('строки ресурса', () => {
	const Row = z.object({ id: z.string(), name: z.string(), role: z.enum(['admin', 'teacher']) })
	type Row = z.infer<typeof Row>
	const list = async (_: { sort?: 'name'; filters?: { role?: 'admin' | 'teacher' } }) => ({
		items: [] as Row[],
		total: 0,
		page: 1,
		pageSize: 20,
	})

	it('собирает ключи заголовков, полей, значений и действий', () => {
		const def = defineResource({
			key: 'people',
			ns: 'm',
			row: Row,
			list,
			perms: { read: 'm.read' },
			columns: [
				{ field: 'name', sort: 'name' },
				{ field: 'role', labels: 'common:roles' },
			],
			filters: [{ field: 'role', options: ['admin', 'teacher'] }],
			create: { schema: z.object({ name: z.string() }), submit: async () => {} },
			actions: [
				action({
					key: 'rename',
					form: { schema: z.object({ name: z.string() }), initial: (r: Row) => ({ name: r.name }) },
					run: async () => {},
				}),
				{ key: 'archive', run: async () => {} },
			],
			pageActions: [{ key: 'export', run: async () => {} }],
		})
		expect(resourceKeys(def)).toEqual([
			'actions.archive.label',
			'actions.archive.success',
			'actions.rename.label',
			'actions.rename.submit',
			'actions.rename.success',
			'actions.rename.title',
			'create.button',
			'create.submit',
			'create.success',
			'create.title',
			'description',
			'empty.description',
			'empty.title',
			'fields.name',
			'fields.role',
			'pageActions.export.busy',
			'pageActions.export.label',
			'title',
			'values.role.admin',
			'values.role.teacher',
		])
	})
})
