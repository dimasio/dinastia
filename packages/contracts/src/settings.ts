// Настройки школы (скилл settings): экран /admin/settings строится из реестра `defineSettings` на сервере — поле
// приходит с видом контрола и значением, меняется по одному модулю за раз.
import { oc } from '@orpc/contract'
import { z } from 'zod'

export const SETTING_KINDS = ['text', 'email', 'url', 'number', 'boolean', 'select'] as const

export const SettingField = z.object({
	/** Модуль и имя: строки — `settings:<модуль>.<имя>.title|description`. */
	module: z.string(),
	name: z.string(),
	/** Раздел экрана: `settings:groups.<группа>`. */
	group: z.string(),
	kind: z.enum(SETTING_KINDS),
	/** Варианты для `select`. */
	options: z.array(z.string()).optional(),
	/** Пустое значение допустимо (для строк). */
	optional: z.boolean(),
	maxLength: z.number().int().optional(),
	value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
	/** Может ли текущий участник менять (owner — всегда). */
	editable: z.boolean(),
})
export type SettingField = z.infer<typeof SettingField>

export const settingsContract = {
	list: oc.route({ method: 'GET', path: '/school/settings' }).output(z.array(SettingField)),
	/** Изменить настройки одного модуля: неизвестное поле — `SETTING_UNKNOWN`, без права — `SETTING_FORBIDDEN`. */
	update: oc
		.route({ method: 'PATCH', path: '/school/settings/{module}' })
		.input(
			z.object({
				module: z.string().max(40),
				patch: z.record(z.string(), z.union([z.string().max(2000), z.number(), z.boolean()])),
			}),
		)
		.output(z.array(SettingField)),
}
