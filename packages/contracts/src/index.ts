// Контракт oRPC всего API (скилл api-endpoints). Новый модуль — `pnpm gen:module` добавит строки у маркеров.

import { assessmentsContract, quizContract } from './assessments.ts'
import { coursesContract } from './courses.ts'
import { filesContract } from './files.ts'
import { learnContract } from './learning.ts'
import { invitationsContract, membersContract, schoolsContract } from './schools.ts'
// gen:module:import

export const contract = {
	schools: schoolsContract,
	invitations: invitationsContract,
	members: membersContract,
	files: filesContract,
	courses: coursesContract,
	learn: learnContract,
	assessments: assessmentsContract,
	quiz: quizContract,
	// gen:module:entry
}

export type Contract = typeof contract
