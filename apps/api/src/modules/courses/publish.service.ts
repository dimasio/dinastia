// Публикация урока и курса (карточка 2.5, domain.md §3 «Курс и публикация»). Блоки копирует ядро (publishBlocks,
// D-033); здесь — статусы, правила и события. Всё — в транзакции запроса: ошибка — ничего не опубликовано.
import type { Course, Lesson } from '@dinastia/contracts/courses'
import { and, asc, eq, isNotNull, isNull, or } from 'drizzle-orm'
import { draftIssues, publishBlocks } from '#/kernel/blocks/blocks.ts'
import type { SchoolCtx } from '#/kernel/context.ts'
import { fail } from '#/kernel/errors.ts'
import { coursePublished, lessonPublished } from './events.ts'
import { courses, lessons } from './schema.ts'
import { courseOrFail, getCourse, toLesson } from './service.ts'

const needsPublish = (l: typeof lessons.$inferSelect) => l.publishedAt === null || l.hasUnpublishedChanges

async function publishOne(ctx: SchoolCtx, lesson: typeof lessons.$inferSelect) {
	const { published } = await publishBlocks(ctx, lesson.id)
	if (published === 0) fail.conflict('LESSON_EMPTY')
	const [row] = await ctx.db
		.update(lessons)
		.set({ publishedAt: ctx.now(), hasUnpublishedChanges: false })
		.where(eq(lessons.id, lesson.id))
		.returning()
	await ctx.emit(lessonPublished, { lessonId: lesson.id, courseId: lesson.courseId })
	return row as typeof lessons.$inferSelect
}

/** Опубликовать урок: черновик блоков → ученикам. Без изменений — как есть, без события. */
export async function publishLesson(ctx: SchoolCtx, id: string): Promise<Lesson> {
	const [lesson] = await ctx.db.select().from(lessons).where(eq(lessons.id, id)).for('update')
	if (!lesson) return fail.notFound('LESSON_NOT_FOUND')
	return toLesson(needsPublish(lesson) ? await publishOne(ctx, lesson) : lesson)
}

/** Опубликовать все уроки курса с изменениями; хоть у одного замечания — не публикуется ни один (список уроков). */
export async function publishCourseChanges(ctx: SchoolCtx, courseId: string): Promise<Course> {
	await courseOrFail(ctx, courseId)
	const pending = await ctx.db
		.select()
		.from(lessons)
		.where(
			and(eq(lessons.courseId, courseId), or(isNull(lessons.publishedAt), eq(lessons.hasUnpublishedChanges, true))),
		)
		.orderBy(asc(lessons.position))
		.for('update')
	const withIssues: { id: string; title: string; blocks: number }[] = []
	for (const l of pending) {
		const issues = await draftIssues(ctx, l.id)
		if (issues.length) withIssues.push({ id: l.id, title: l.title, blocks: issues.length })
	}
	if (withIssues.length) fail.conflict('COURSE_LESSONS_HAVE_ISSUES', { lessons: withIssues })
	for (const l of pending) await publishOne(ctx, l)
	return getCourse(ctx, courseId)
}

/** Черновик курса → опубликован (виден зачисленным); нужен хотя бы один опубликованный урок. Обратно — только архив. */
export async function publishCourse(ctx: SchoolCtx, id: string): Promise<Course> {
	const course = await courseOrFail(ctx, id)
	if (course.status === 'archived') fail.conflict('COURSE_ARCHIVED')
	if (course.status === 'draft') {
		const [any] = await ctx.db
			.select({ id: lessons.id })
			.from(lessons)
			.where(and(eq(lessons.courseId, id), isNotNull(lessons.publishedAt)))
			.limit(1)
		if (!any) fail.conflict('COURSE_NO_PUBLISHED_LESSONS')
		await ctx.db.update(courses).set({ status: 'published' }).where(eq(courses.id, id))
		await ctx.audit('courses.course.published', {
			entity: 'course',
			id,
			diff: { status: { from: 'draft', to: 'published' } },
		})
		await ctx.emit(coursePublished, { courseId: id })
	}
	return getCourse(ctx, id)
}
