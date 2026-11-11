import { z } from 'zod'
import { defineSettings } from '#/kernel/settings/settings.ts'
import { schoolsSettingsTable } from './schema.ts'

const optional = <T extends z.ZodString | z.ZodEmail | z.ZodURL>(s: T) => z.union([z.literal(''), s])

/** Настройки школы (экран /admin/settings). Юридическое — 5.5, скилл personal-data. */
export const schoolsSettings = defineSettings('schools', schoolsSettingsTable, {
	pdOperator: { schema: z.string().trim().max(300), group: 'legal', edit: ['admin'] },
	pdContact: { schema: optional(z.email().max(254)), group: 'legal', edit: ['admin'] },
	privacyUrl: { schema: optional(z.url({ protocol: /^https$/ }).max(500)), group: 'legal', edit: ['admin'] },
})
