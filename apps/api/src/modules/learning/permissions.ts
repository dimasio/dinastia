import { definePermissions } from '#/kernel/permissions.ts'

// Разрешения модуля (скилл permissions); owner имеет все неявно. Учиться — только ученик (зачисления — фаза 4).
export const permissions = definePermissions('learning', {
	study: ['student'], // свои курсы и уроки в области /learn (2.6)
})
