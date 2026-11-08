// Сводный реестр разрешений (скилл permissions). Тип Permission — объединение ключей всех модулей.
// Список ведётся здесь, а не через modules/index.ts: роутеры модулей импортируют `can` отсюда — обратный импорт дал бы цикл.
import type { MemberRole } from '@dinastia/contracts/schools'
import { createCan, mergePermissions, permissionsOf } from './kernel/permissions.ts'
import { permissions as files } from './kernel/storage/permissions.ts'
import { permissions as assessments } from './modules/assessments/permissions.ts'
import { permissions as courses } from './modules/courses/permissions.ts'
import { permissions as learning } from './modules/learning/permissions.ts'
import { permissions as schools } from './modules/schools/permissions.ts'
// gen:module:permissions-import

export const permissionMap = mergePermissions(
	files,
	schools,
	courses,
	learning,
	assessments,
	// gen:module:permissions
)

export type Permission = keyof typeof permissionMap

/** `.use(can('schools.members.manage'))` — после mw.member; опечатка в имени — ошибка компиляции. */
export const can = createCan(permissionMap)

export const rolePermissions = (role: MemberRole): Permission[] => permissionsOf(permissionMap, role)
