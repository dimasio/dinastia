import { definePermissions } from '#/kernel/permissions.ts'

// Роли — domain.md §2; owner имеет все разрешения неявно.
export const permissions = definePermissions('schools', {
	access: ['admin', 'teacher', 'curator', 'student'], // войти в школу и узнать свою роль
	'members.read': ['admin', 'teacher'],
	'members.manage': ['admin'], // приглашать сотрудников, менять роли, блокировать
	'settings.manage': ['admin'],
	delete: [], // только owner
})
