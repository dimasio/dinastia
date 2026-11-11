import { definePermissions } from '../permissions.ts'

// Выгрузки: процедура пускает сотрудников, право конкретной выгрузки (`defineExport.perm`) проверяет сервис.
export const permissions = definePermissions('exports', {
	use: ['admin', 'teacher', 'curator'],
})
