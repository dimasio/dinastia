// Контракт oRPC всего API (скилл api-endpoints). Модуль добавляет сюда свой контракт.
import { invitationsContract, schoolsContract } from './schools.ts'

export const contract = {
	schools: schoolsContract,
	invitations: invitationsContract,
}

export type Contract = typeof contract
