import { definePermissions } from '#/kernel/permissions.ts'

// Разрешения модуля (скилл permissions, карточка 4.7); owner имеет все неявно. Область куратора — `groupScope` модуля learning.
export const permissions = definePermissions('certificates', {
	manage: ['admin', 'teacher'], // шаблон курса, «Выдать прошедшим», аннулировать
	view: ['admin', 'teacher', 'curator'], // выданные сертификаты курса и скачивание (куратор — только своих потоков)
	own: ['student'], // свои сертификаты в кабинете
})
