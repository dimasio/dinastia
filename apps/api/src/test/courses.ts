// Курс и урок для тестов механизмов ядра (блоки, вопросы): на `lessons` и `courses` ссылаются внешние ключи
// `lesson_blocks.lesson_id` и `questions.course_id` (миграция 0008, D-054) — выдуманный id больше не годится.
import { randomUUID } from 'node:crypto'
import { withTenant } from '#/kernel/db/tenant.ts'
import { courses, lessons, sections } from '#/modules/courses/schema.ts'

/** Новый курс-черновик школы; вернёт его id. */
export const courseIn = (schoolId: string) =>
	withTenant(schoolId, async (tx) => {
		const [c] = await tx
			.insert(courses)
			.values({ title: 'Тестовый курс', slug: `t-${randomUUID().slice(0, 8)}` })
			.returning({ id: courses.id })
		if (!c) throw new Error('курс не создан')
		return c.id
	})

/** Новый урок (в новом курсе и разделе); вернёт id урока. */
export const lessonIn = async (schoolId: string) => {
	const courseId = await courseIn(schoolId)
	return withTenant(schoolId, async (tx) => {
		const [s] = await tx
			.insert(sections)
			.values({ courseId, title: 'Раздел', position: 0 })
			.returning({ id: sections.id })
		if (!s) throw new Error('раздел не создан')
		const [l] = await tx
			.insert(lessons)
			.values({ courseId, sectionId: s.id, title: 'Урок', position: 0 })
			.returning({ id: lessons.id })
		if (!l) throw new Error('урок не создан')
		return l.id
	})
}
