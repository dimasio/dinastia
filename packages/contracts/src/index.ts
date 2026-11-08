// Контракт oRPC всего API (скилл api-endpoints). Новый модуль — `pnpm gen:module` добавит строки у маркеров.

import { assessmentsContract, assignmentContract, quizContract, reviewContract } from './assessments.ts'
import { coursesContract } from './courses.ts'
import { filesContract } from './files.ts'
import { learnContract, learningContract } from './learning.ts'
import { invitationsContract, membersContract, schoolsContract } from './schools.ts'
// gen:module:import

export const contract = {
	schools: schoolsContract,
	invitations: invitationsContract,
	members: membersContract,
	files: filesContract,
	courses: coursesContract,
	learn: learnContract,
	learning: learningContract,
	assessments: assessmentsContract,
	quiz: quizContract,
	assignment: assignmentContract,
	review: reviewContract,
	// gen:module:entry
}

export type Contract = typeof contract
