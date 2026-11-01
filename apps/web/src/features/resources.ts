// Реестр ресурсов веба (скилл admin-resource): по нему тест проверяет строки экранов. Новый — `pnpm gen:resource`.
import type { ResourceDef } from '@dinastia/ui/resource'
import { coursesResource } from './courses/resources/courses.ts'
import { staffResource } from './schools/resources/staff.ts'
// gen:resource:import

// biome-ignore lint/suspicious/noExplicitAny: у каждого ресурса свой тип строки и входа
export const resources: ResourceDef<any, any>[] = [
	staffResource,
	coursesResource,
	// gen:resource:entry
]
