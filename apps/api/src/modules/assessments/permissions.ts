import { definePermissions } from '#/kernel/permissions.ts'

// Банк вопросов курса (карточка 3.1): куратор читает, правят преподаватели; owner имеет всё неявно.
export const permissions = definePermissions('assessments', {
	'bank.read': ['admin', 'teacher', 'curator'], // список и содержимое вопросов банка, теги
	'bank.manage': ['admin', 'teacher'], // создать, изменить, убрать в архив вопрос; теги курса
	attempt: ['student'], // проходить тесты: начать попытку, отвечать, сдавать (3.3)
})
