// Сводный реестр разрешений: модуль добавляет сюда свои permissions. Тип Permission — объединение всех ключей.

import type { MemberRole } from '@dinastia/contracts/schools'
import { createCan, mergePermissions, permissionsOf } from './kernel/permissions.ts'
import { permissions as schools } from './modules/schools/permissions.ts'

export const permissionMap = mergePermissions(schools)

export type Permission = keyof typeof permissionMap

/** `.use(can('schools.members.manage'))` — после mw.member; опечатка в имени — ошибка компиляции. */
export const can = createCan(permissionMap)

export const rolePermissions = (role: MemberRole): Permission[] => permissionsOf(permissionMap, role)
