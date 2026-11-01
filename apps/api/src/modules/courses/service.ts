// Курсы, разделы, уроки (скилл lms-courses; правила — domain.md §3 «Курс и публикация», карточка 2.1).
// Только ctx.db (транзакция школы, RLS); порядок — position с шагом 1000, перестановка — перенумерация соседей.
import type {
	Course,
	CourseCreate,
	CourseListQuery,
	CourseRow,
	CourseUpdate,
	Lesson,
} from '@dinastia/contracts/courses'
import { and, asc, count, eq, inArray, like, ne, or, sql } from 'drizzle-orm'
import type { SchoolCtx } from '#/kernel/context.ts'
import { listQuery, toPage } from '#/kernel/db/listing.ts'
import { fail } from '#/kernel/errors.ts'
import { courses, lessons, sections } from './schema.ts'
import { nextFreeSlug, slugify } from './slug.ts'

export const POSITION_STEP = 1000

// Имена — явно: во вложенном подзапросе Drizzle выводит колонки без таблицы, и `course_id = id` сравнило бы колонки
// самой sections (счётчики всегда 0 — поймал тест списка).
const sectionsCount = sql<number>`(select count(*)::int from sections s where s.course_id = ${courses}.id)`
const lessonsCount = sql<number>`(select count(*)::int from lessons l where l.course_id = ${courses}.id)`

const rowColumns = {
	id: courses.id,
	title: courses.title,
	slug: courses.slug,
	status: courses.status,
	sectionsCount,
	lessonsCount,
	updatedAt: courses.updatedAt,
}

export async function listCourses(ctx: SchoolCtx, input: CourseListQuery) {
	const q = listQuery(input, {
		search: [courses.title, courses.slug],
		sort: { updatedAt: courses.updatedAt, title: courses.title, createdAt: courses.createdAt },
		tiebreak: courses.id,
		filters: { status: courses.status },
	})
	const [items, [total]] = await Promise.all([
		ctx.db
			.select(rowColumns)
			.from(courses)
			.where(q.where)
			.orderBy(...q.orderBy)
			.limit(q.limit)
			.offset(q.offset),
		ctx.db.select({ n: count() }).from(courses).where(q.where),
	])
	return toPage(items satisfies CourseRow[], total?.n ?? 0, input)
}

export async function courseOrFail(ctx: SchoolCtx, id: string) {
	const [row] = await ctx.db.select().from(courses).where(eq(courses.id, id)).limit(1)
	return row ?? fail.notFound('COURSE_NOT_FOUND')
}

async function courseRow(ctx: SchoolCtx, id: string): Promise<CourseRow> {
	const [row] = await ctx.db.select(rowColumns).from(courses).where(eq(courses.id, id))
	return row ?? fail.notFound('COURSE_NOT_FOUND')
}

/** Курс с деревом разделов и уроков по порядку. */
export async function getCourse(ctx: SchoolCtx, id: string): Promise<Course> {
	const course = await courseOrFail(ctx, id)
	const [sectionRows, lessonRows] = await Promise.all([
		ctx.db.select().from(sections).where(eq(sections.courseId, id)).orderBy(asc(sections.position), asc(sections.id)),
		ctx.db.select().from(lessons).where(eq(lessons.courseId, id)).orderBy(asc(lessons.position), asc(lessons.id)),
	])
	return {
		id: course.id,
		title: course.title,
		slug: course.slug,
		status: course.status,
		// в БД — документ, проверенный схемой профиля при записи (RichText контракта)
		description: course.description as Course['description'],
		defaultAccessMode: course.defaultAccessMode,
		accessDays: course.accessDays,
		completionThresholdPct: course.completionThresholdPct,
		createdAt: course.createdAt,
		updatedAt: course.updatedAt,
		sections: sectionRows.map((s) => ({
			id: s.id,
			courseId: s.courseId,
			title: s.title,
			position: s.position,
			lessons: lessonRows.filter((l) => l.sectionId === s.id).map(toLesson),
		})),
	}
}

export const toLesson = (l: typeof lessons.$inferSelect): Lesson => ({
	id: l.id,
	courseId: l.courseId,
	sectionId: l.sectionId,
	title: l.title,
	position: l.position,
	accessMode: l.accessMode,
	completionRule: l.completionRule,
	publishedAt: l.publishedAt,
	hasUnpublishedChanges: l.hasUnpublishedChanges,
})

/** Занятые адреса с тем же началом — для `nextFreeSlug` (кроме самого курса). */
async function takenSlugs(ctx: SchoolCtx, base: string, exceptId?: string) {
	const rows = await ctx.db
		.select({ slug: courses.slug })
		.from(courses)
		.where(
			and(
				or(eq(courses.slug, base), like(courses.slug, `${base.slice(0, 50)}%`)),
				exceptId ? ne(courses.id, exceptId) : undefined,
			),
		)
	return new Set(rows.map((r) => r.slug))
}

export async function createCourse(ctx: SchoolCtx, input: CourseCreate): Promise<Course> {
	let slug: string
	if (input.slug) {
		if ((await takenSlugs(ctx, input.slug)).has(input.slug))
			return fail.conflict('COURSE_SLUG_TAKEN', { slug: input.slug })
		slug = input.slug
	} else {
		const base = slugify(input.title)
		slug = nextFreeSlug(base, await takenSlugs(ctx, base))
	}
	const [row] = await ctx.db
		.insert(courses)
		.values({ title: input.title, slug, ...(input.description ? { description: input.description } : {}) })
		.returning({ id: courses.id })
	if (!row) throw new Error('курс не создан')
	return getCourse(ctx, row.id)
}

export async function updateCourse(ctx: SchoolCtx, input: CourseUpdate): Promise<Course> {
	const course = await courseOrFail(ctx, input.id)
	const { id, ...patch } = input
	if (patch.slug !== undefined && patch.slug !== course.slug) {
		// адрес опубликованного курса уже у учеников — менять нельзя (карточка 2.1)
		if (course.status !== 'draft') fail.conflict('COURSE_SLUG_LOCKED')
		if ((await takenSlugs(ctx, patch.slug, id)).has(patch.slug))
			fail.conflict('COURSE_SLUG_TAKEN', { slug: patch.slug })
	}
	const set = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))
	if (Object.keys(set).length) await ctx.db.update(courses).set(set).where(eq(courses.id, id))
	return getCourse(ctx, id)
}

/** В архив: новые зачисления запрещены, у зачисленных доступ сохраняется. Повтор — без изменений. */
export async function archiveCourse(ctx: SchoolCtx, id: string): Promise<CourseRow> {
	const course = await courseOrFail(ctx, id)
	if (course.status !== 'archived') {
		await ctx.db.update(courses).set({ status: 'archived' }).where(eq(courses.id, id))
		await ctx.audit('courses.course.archived', {
			entity: 'course',
			id,
			diff: { status: { from: course.status, to: 'archived' } },
		})
	}
	return courseRow(ctx, id)
}

/** Удалить можно только черновик без уроков; остальное — в архив (карточка 2.1). */
export async function removeCourse(ctx: SchoolCtx, id: string) {
	const course = await courseOrFail(ctx, id)
	if (course.status !== 'draft') fail.conflict('COURSE_NOT_DRAFT')
	const [lessonTotal] = await ctx.db.select({ n: count() }).from(lessons).where(eq(lessons.courseId, id))
	if ((lessonTotal?.n ?? 0) > 0) fail.conflict('COURSE_NOT_EMPTY', { lessons: lessonTotal?.n })
	await ctx.db.delete(courses).where(eq(courses.id, id))
	await ctx.audit('courses.course.removed', { entity: 'course', id, diff: { title: course.title } })
	return { ok: true as const }
}

/** Перенумеровать по порядку `ids` (шаг 1000). */
async function renumber(ctx: SchoolCtx, table: typeof sections | typeof lessons, ids: string[]) {
	for (const [i, rowId] of ids.entries())
		await ctx.db
			.update(table)
			.set({ position: i * POSITION_STEP })
			.where(eq(table.id, rowId))
}

const insertAt = (ids: string[], id: string, index: number) => {
	const rest = ids.filter((x) => x !== id)
	rest.splice(Math.min(index, rest.length), 0, id)
	return rest
}

// ── разделы ─────────────────────────────────────────────────────────────────

async function sectionOrFail(ctx: SchoolCtx, id: string) {
	const [row] = await ctx.db.select().from(sections).where(eq(sections.id, id)).limit(1)
	return row ?? fail.notFound('SECTION_NOT_FOUND')
}

const sectionDto = (s: typeof sections.$inferSelect) => ({
	id: s.id,
	courseId: s.courseId,
	title: s.title,
	position: s.position,
})

export async function createSection(ctx: SchoolCtx, input: { courseId: string; title: string }) {
	await courseOrFail(ctx, input.courseId)
	const [last] = await ctx.db
		.select({ max: sql<number | null>`max(${sections.position})` })
		.from(sections)
		.where(eq(sections.courseId, input.courseId))
	const position = last?.max === null || last?.max === undefined ? 0 : last.max + POSITION_STEP
	const [row] = await ctx.db
		.insert(sections)
		.values({ courseId: input.courseId, title: input.title, position })
		.returning()
	if (!row) throw new Error('раздел не создан')
	return sectionDto(row)
}

export async function renameSection(ctx: SchoolCtx, input: { id: string; title: string }) {
	await sectionOrFail(ctx, input.id)
	const [row] = await ctx.db.update(sections).set({ title: input.title }).where(eq(sections.id, input.id)).returning()
	return sectionDto(row as typeof sections.$inferSelect)
}

export async function moveSection(ctx: SchoolCtx, input: { id: string; index: number }) {
	const section = await sectionOrFail(ctx, input.id)
	const siblings = await ctx.db
		.select({ id: sections.id })
		.from(sections)
		.where(eq(sections.courseId, section.courseId))
		.orderBy(asc(sections.position), asc(sections.id))
	await renumber(
		ctx,
		sections,
		insertAt(
			siblings.map((s) => s.id),
			input.id,
			input.index,
		),
	)
	const rows = await ctx.db
		.select()
		.from(sections)
		.where(eq(sections.courseId, section.courseId))
		.orderBy(asc(sections.position))
	return rows.map(sectionDto)
}

/** Раздел удаляется вместе с уроками и их блоками (каскад); подтверждение — в интерфейсе. */
export async function removeSection(ctx: SchoolCtx, id: string) {
	const section = await sectionOrFail(ctx, id)
	const [total] = await ctx.db.select({ n: count() }).from(lessons).where(eq(lessons.sectionId, id))
	await ctx.db.delete(sections).where(eq(sections.id, id))
	await ctx.audit('courses.section.removed', {
		entity: 'section',
		id,
		diff: { title: section.title, lessons: total?.n ?? 0 },
	})
	return { ok: true as const }
}

// ── уроки ───────────────────────────────────────────────────────────────────

async function lessonOrFail(ctx: SchoolCtx, id: string) {
	const [row] = await ctx.db.select().from(lessons).where(eq(lessons.id, id)).limit(1)
	return row ?? fail.notFound('LESSON_NOT_FOUND')
}

export async function createLesson(ctx: SchoolCtx, input: { sectionId: string; title: string }) {
	const section = await sectionOrFail(ctx, input.sectionId)
	const [last] = await ctx.db
		.select({ max: sql<number | null>`max(${lessons.position})` })
		.from(lessons)
		.where(eq(lessons.sectionId, input.sectionId))
	const position = last?.max === null || last?.max === undefined ? 0 : last.max + POSITION_STEP
	const [row] = await ctx.db
		.insert(lessons)
		.values({ courseId: section.courseId, sectionId: section.id, title: input.title, position })
		.returning()
	if (!row) throw new Error('урок не создан')
	return toLesson(row)
}

export async function renameLesson(ctx: SchoolCtx, input: { id: string; title: string }) {
	await lessonOrFail(ctx, input.id)
	const [row] = await ctx.db.update(lessons).set({ title: input.title }).where(eq(lessons.id, input.id)).returning()
	return toLesson(row as typeof lessons.$inferSelect)
}

/** Переместить урок в позицию `index` раздела `sectionId` — только в пределах своего курса. */
export async function moveLesson(ctx: SchoolCtx, input: { id: string; sectionId: string; index: number }) {
	const lesson = await lessonOrFail(ctx, input.id)
	const target = await sectionOrFail(ctx, input.sectionId)
	if (target.courseId !== lesson.courseId) fail.invalid('LESSON_MOVE_OTHER_COURSE')
	if (target.id !== lesson.sectionId)
		await ctx.db.update(lessons).set({ sectionId: target.id }).where(eq(lessons.id, lesson.id))
	const siblings = await ctx.db
		.select({ id: lessons.id })
		.from(lessons)
		.where(and(eq(lessons.sectionId, target.id), ne(lessons.id, lesson.id)))
		.orderBy(asc(lessons.position), asc(lessons.id))
	await renumber(ctx, lessons, insertAt([...siblings.map((s) => s.id), lesson.id], lesson.id, input.index))
	const rows = await ctx.db
		.select()
		.from(lessons)
		.where(inArray(lessons.sectionId, [target.id]))
		.orderBy(asc(lessons.position))
	return rows.map(toLesson)
}

/** Урок удаляется вместе с блоками (черновик и публикация, каскад). */
export async function removeLesson(ctx: SchoolCtx, id: string) {
	const lesson = await lessonOrFail(ctx, id)
	await ctx.db.delete(lessons).where(eq(lessons.id, id))
	await ctx.audit('courses.lesson.removed', { entity: 'lesson', id, diff: { title: lesson.title } })
	return { ok: true as const }
}
