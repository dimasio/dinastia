import { definePermissions } from '#/kernel/permissions.ts'

// Роли — domain.md §2; owner имеет все разрешения неявно.
export const permissions = definePermissions('schools', {
	access: ['admin', 'teacher', 'curator', 'student'], // войти в школу и узнать свою роль
	'members.read': ['admin', 'teacher'],
	'members.manage': ['admin'], // приглашать сотрудников, менять роли, блокировать
	'settings.manage': ['admin'],
	'branding.manage': ['admin'], // оформление школы: логотип, цвета, шрифт (5.9)
	'pd.manage': ['admin'], // выгрузить и удалить данные ученика по его запросу (5.5)
	delete: [], // только owner
})
