import { definePermissions } from '../permissions.ts'

// Загрузка файлов: процедура пускает любого участника, право конкретного назначения (purpose.perm) проверяет сервис.
export const permissions = definePermissions('files', {
	upload: ['admin', 'teacher', 'curator', 'student'],
})
