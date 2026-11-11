// Контракт oRPC всего API (скилл api-endpoints). Новый модуль — `pnpm gen:module` добавит строки у маркеров.

import { assessmentsContract, assignmentContract, quizContract, reviewContract } from './assessments.ts'
import { certificatesContract } from './certificates.ts'
import { coursesContract } from './courses.ts'
import { exportsContract } from './exports.ts'
import { filesContract } from './files.ts'
import { joinContract, learnContract, learningContract, studentsContract } from './learning.ts'
import { invitationsContract, membersContract, schoolsContract } from './schools.ts'
import { settingsContract } from './settings.ts'
// gen:module:import

export const contract = {
	schools: schoolsContract,
	invitations: invitationsContract,
	members: membersContract,
	students: studentsContract,
	files: filesContract,
	exports: exportsContract,
	settings: settingsContract,
	courses: coursesContract,
	learn: learnContract,
	learning: learningContract,
	join: joinContract,
	assessments: assessmentsContract,
	quiz: quizContract,
	assignment: assignmentContract,
	review: reviewContract,
	certificates: certificatesContract,
	// gen:module:entry
}

export type Contract = typeof contract
