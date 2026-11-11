import { definePermissions } from '#/kernel/permissions.ts'

// Разрешения модуля (скилл permissions); owner имеет все неявно. Учиться — только ученик. Область куратора — policies.ts.
export const permissions = definePermissions('learning', {
	study: ['student'], // свои курсы и уроки в области /learn (2.6)
	read: ['admin', 'teacher', 'curator'], // ученики и потоки курса (куратор — только своих потоков, 4.2)
	enroll: ['admin', 'teacher'], // зачислять, продлять срок, отзывать и возвращать доступ (4.1)
	analytics: ['admin', 'teacher', 'curator'], // аналитика курса и выгрузка учеников (куратор — только своих потоков, 4.6)
	'groups.manage': ['admin', 'teacher'], // создавать, менять, удалять потоки, назначать кураторов, переводить учеников (4.2)
})
