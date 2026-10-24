// Роутер всего API: реализация контракта (@dinastia/contracts). Модуль добавляет сюда свой роутер.
import { impl } from './kernel/orpc.ts'
import { invitationsRouter, schoolsRouter } from './modules/schools/router.ts'

export const router = impl.router({
	schools: schoolsRouter,
	invitations: invitationsRouter,
})

export type Router = typeof router
