import { definePermissions } from '#/kernel/permissions.ts'

// Консоль оператора — не роль школы: доступ решает `mw.operator` (`users.platform_role`), разрешений школы нет.
export const permissions = definePermissions('ops', {})
