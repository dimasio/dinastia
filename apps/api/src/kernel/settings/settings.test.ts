// Настройки школы (пункт 1.14): default колонки без строки, изоляция школ, чтение в сервисе и в задаче, изменение
// по правам и схеме с записью в журнал, ошибки объявления. Пробная таблица — test/probes.ts (global-setup).
import { randomUUID } from 'node:crypto'
import { schools, settingsTable } from '@dinastia/db'
import { resources } from '@dinastia/i18n'
import { inArray } from 'drizzle-orm'
import { boolean, integer, text } from 'drizzle-orm/pg-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ZodError, z } from 'zod'
import { probeSettings } from '#/test/probes.ts'
import { auditLog } from '../audit/schema.ts'
import type { BaseCtx } from '../context.ts'
import { db, pool } from '../db/client.ts'
import { withTenant } from '../db/tenant.ts'
import { defineJob } from '../jobs.ts'
import { log } from '../log.ts'
import { settingsIssues as registryIssues } from '../registry-check.ts'
import { tenantCtx } from '../tenant-ctx.ts'
import { runJob } from '../worker-runtime.ts'
import { defineSettings, updateSettings } from './settings.ts'

const probe = defineSettings('kernel-probe', probeSettings, {
	selfEnroll: { schema: z.boolean(), group: 'learning', edit: ['owner', 'admin'] },
	reminderHours: { schema: z.number().int().min(1).max(168), group: 'notifications', edit: ['owner', 'admin'] },
})

type School = { id: string; slug: string; name: string }
let a: School
let b: School
let c: School
const inSchool = <T>(s: School, fn: (ctx: BaseCtx) => Promise<T>) =>
	withTenant(s.id, (tx) => fn(tenantCtx(tx, s, { now: () => new Date(), log })))
/** Контекст участника с ролью (для изменения настроек). */
const asRole = <T>(
	s: School,
	role: 'owner' | 'admin' | 'teacher',
	fn: (ctx: BaseCtx & { member: { role: typeof role } }) => Promise<T>,
) => inSchool(s, (ctx) => fn({ ...ctx, member: { role } }))

beforeAll(async () => {
	const rows = await db
		.insert(schools)
		.values([
			{ slug: `st-a-${randomUUID().slice(0, 8)}`, name: 'A' },
			{ slug: `st-b-${randomUUID().slice(0, 8)}`, name: 'B' },
			{ slug: `st-c-${randomUUID().slice(0, 8)}`, name: 'C' },
		])
		.returning({ id: schools.id, slug: schools.slug, name: schools.name })
	if (!rows[0] || !rows[1] || !rows[2]) throw new Error('школы не созданы')
	;[a, b, c] = [rows[0], rows[1], rows[2]]
})

afterAll(async () => {
	await db.delete(schools).where(inArray(schools.id, [a.id, b.id, c.id]))
	await pool.end()
})

describe('чтение', () => {
	it('у новой школы — default колонок, строка создаётся при первом чтении; типы — из таблицы', async () => {
		await inSchool(a, async (ctx) => {
			expect(await ctx.db.select().from(probeSettings)).toEqual([])
			const enroll: boolean = await ctx.settings.get(probe, 'selfEnroll')
			const hours: number = await ctx.settings.get(probe, 'reminderHours')
			expect([enroll, hours]).toEqual([true, 24])
			expect(await ctx.settings.all(probe)).toEqual({ selfEnroll: true, reminderHours: 24 })
			expect(await ctx.db.select().from(probeSettings)).toHaveLength(1)
		})
	})

	it('настройка читается в фоновой задаче — тем же ctx.settings', async () => {
		await asRole(a, 'owner', (ctx) => updateSettings(ctx, probe, { reminderHours: 48 }))
		const seen: number[] = []
		const job = defineJob({
			name: 'probe.read-settings',
			schema: z.object({}),
			handler: async (ctx) => {
				seen.push(await ctx.settings.get(probe, 'reminderHours'))
			},
		})
		await runJob(job, { schoolId: a.id, data: {} }, { jobId: 'test' })
		expect(seen).toEqual([48])
	})
})

describe('изменение', () => {
	it('владелец и администратор меняют, преподаватель — нет; значение — по схеме; изменение — в журнале', async () => {
		const updated = await asRole(b, 'admin', (ctx) => updateSettings(ctx, probe, { selfEnroll: false }))
		expect(updated).toEqual({ selfEnroll: false, reminderHours: 24 })
		await expect(asRole(b, 'teacher', (ctx) => updateSettings(ctx, probe, { reminderHours: 2 }))).rejects.toMatchObject(
			{
				code: 'SETTING_FORBIDDEN',
			},
		)
		await expect(asRole(b, 'owner', (ctx) => updateSettings(ctx, probe, { reminderHours: 0 }))).rejects.toBeInstanceOf(
			ZodError,
		)
		await expect(
			asRole(b, 'owner', (ctx) => updateSettings(ctx, probe, { color: 'red' } as never)),
		).rejects.toMatchObject({ code: 'SETTING_UNKNOWN' })
		// без изменений — без записи в журнал
		await asRole(b, 'owner', (ctx) => updateSettings(ctx, probe, { selfEnroll: false }))

		const journal = await withTenant(b.id, (tx) => tx.select().from(auditLog))
		expect(journal.map((r) => [r.action, r.diff])).toEqual([
			['settings.kernel-probe.changed', { selfEnroll: { from: true, to: false } }],
		])
	})

	it('школы не видят и не меняют настройки друг друга', async () => {
		await asRole(a, 'owner', (ctx) => updateSettings(ctx, probe, { selfEnroll: false }))
		// у школы C своя строка: изменение школы A её не трогает
		const fresh = await inSchool(c, (ctx) => ctx.settings.all(probe))
		expect(fresh).toEqual({ selfEnroll: true, reminderHours: 24 })
	})
})

describe('объявление', () => {
	const table = settingsTable('kernel_probe_bad_settings', {
		color: text('color').notNull(),
		limit: integer('limit').notNull().default(1),
		extra: boolean('extra').default(false),
	})

	it('поле без колонки, колонка без поля, колонка без default, чужое имя таблицы — ошибки', () => {
		expect(() =>
			defineSettings('kernel-probe-bad', table, {
				color: { schema: z.string(), group: 'g', edit: [] },
				limit: { schema: z.number(), group: 'g', edit: [] },
				missing: { schema: z.string(), group: 'g', edit: [] },
			} as never),
		).toThrow(/поле missing — нет такой колонки.*колонка extra не описана.*колонка color без default/)
		expect(() =>
			defineSettings('learning', probeSettings, {
				selfEnroll: { schema: z.boolean(), group: 'g', edit: [] },
				reminderHours: { schema: z.number(), group: 'g', edit: [] },
			}),
		).toThrow('таблица kernel_probe_settings, ожидалась learning_settings')
	})

	it('check:registries требует строки экрана: подпись, описание, группа', () => {
		expect(registryIssues([probe], resources.ru.settings).map((i) => i.message)).toEqual([
			'нет строки settings:kernel-probe.selfEnroll.title',
			'нет строки settings:kernel-probe.selfEnroll.description',
			'нет строки settings:groups.learning',
			'нет строки settings:kernel-probe.reminderHours.title',
			'нет строки settings:kernel-probe.reminderHours.description',
			'нет строки settings:groups.notifications',
		])
	})
})
