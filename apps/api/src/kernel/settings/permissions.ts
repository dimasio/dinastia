import { definePermissions } from '../permissions.ts'

// Своих разрешений нет: экран — по `schools.settings.manage`, поле — по своему `edit`.
export const permissions = definePermissions('settings', {})
