import { definePermissions } from '../permissions.ts'

// Выгрузки: процедура пускает участников, право конкретной выгрузки (`defineExport.perm`) проверяет сервис; ученик —
// только свои данные (5.5).
export const permissions = definePermissions('exports', {
	use: ['admin', 'teacher', 'curator', 'student'],
})
