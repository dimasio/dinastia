import { definePermissions } from '#/kernel/permissions.ts'

// Банк вопросов курса (карточка 3.1): куратор читает, правят преподаватели; owner имеет всё неявно.
export const permissions = definePermissions('assessments', {
	'bank.read': ['admin', 'teacher', 'curator'], // список и содержимое вопросов банка, теги
	'bank.manage': ['admin', 'teacher'], // создать, изменить, убрать в архив вопрос; теги курса
	submit: ['student'], // сдавать домашние задания и прикладывать файлы (3.4)
	review: ['admin', 'teacher'], // проверять сдачи; куратор — в 3.5 вместе с областью «свои потоки»
	attempt: ['student'], // проходить тесты: начать попытку, отвечать, сдавать (3.3)
})
