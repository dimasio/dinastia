import { definePermissions } from '#/kernel/permissions.ts'

// Роли — domain.md §2; owner имеет все разрешения неявно. Карточка 2.1: куратор видит курсы, но не правит.
export const permissions = definePermissions('courses', {
	read: ['admin', 'teacher', 'curator'], // список и содержимое курсов в админке
	manage: ['admin', 'teacher'], // создать, изменить, архивировать, удалить; разделы и уроки
	publish: ['admin', 'teacher'], // опубликовать урок и курс (2.5)
})
