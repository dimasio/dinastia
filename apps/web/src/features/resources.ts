// Реестр ресурсов веба (скилл admin-resource): по нему тест проверяет строки экранов. Новый — `pnpm gen:resource`.
import type { ResourceDef } from '@dinastia/ui/resource'
import { questionsResource } from './assessments/resources/questions.tsx'
import { reviewResource } from './assessments/resources/review.tsx'
import { issuedResource } from './certificates/resources/issued.tsx'
import { coursesResource } from './courses/resources/courses.tsx'
import { enrollmentsResource } from './learning/resources/enrollments.tsx'
import { studentsResource } from './learning/resources/students.ts'
import { opsAuditResource, opsSchoolsResource } from './ops/resources.tsx'
import { staffResource } from './schools/resources/staff.ts'
// gen:resource:import

// biome-ignore lint/suspicious/noExplicitAny: у каждого ресурса свой тип строки и входа
export const resources: ResourceDef<any, any>[] = [
	staffResource,
	coursesResource,
	// образец без тегов: настоящий ресурс строится на курс, а фильтр по тегу — по тегам курса (экран банка вопросов)
	questionsResource({ courseId: '', tags: [], onCreate: () => undefined }),
	reviewResource({ courses: [] }),
	// ученики курса строятся на курс — образец без курса
	enrollmentsResource({ courseId: '' }),
	// выданные сертификаты курса — образец без курса
	issuedResource({ courseId: '' }),
	studentsResource,
	opsSchoolsResource,
	opsAuditResource,
	// gen:resource:entry
]
