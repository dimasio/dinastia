// Помощники тестов модуля learning (карточка 4.2): куратор видит только учеников своих потоков — тестам проверки нужен поток.
import type { TestSchool } from '#/test/school.ts'

/** Создать поток курса с куратором школы и перевести в него всех учеников курса; вернёт поток. */
export async function intoCuratorGroup(t: TestSchool, courseId: string) {
	const teacher = t.as('teacher')
	const curator = (await teacher.learning.groups.curatorOptions()).find((o) => o.email === t.people.curator.email)
	if (!curator) throw new Error('нет куратора школы')
	const group = await teacher.learning.groups.create({
		courseId,
		title: 'Группа куратора',
		curatorIds: [curator.memberId],
	})
	const { items } = await teacher.learning.enrollments.list({ courseId, pageSize: 100 })
	for (const e of items) await teacher.learning.enrollments.move({ id: e.id, groupId: group.id })
	return group
}
