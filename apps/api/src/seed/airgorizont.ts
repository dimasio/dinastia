// Учебный центр АИР «Горизонт» (скилл local-env): сотрудники, слушатель, курс по первой помощи (seed/first-aid.ts) с банком
// вопросов, тестами, практическими заданиями и удостоверением, учебная группа с куратором. Всё — через сервисы, как из
// запросов сотрудников. Писем не отправляет: подписчиков событий в сиде нет. Центр уже есть — ничего не делает.
import type { MemberRole } from '@dinastia/contracts/schools'
import { eq } from 'drizzle-orm'
import { auth } from '../kernel/auth/auth.ts'
import { users } from '../kernel/auth/schema.ts'
import type { SchoolCtx } from '../kernel/context.ts'
import { db, type Tx } from '../kernel/db/client.ts'
import { withTenant } from '../kernel/db/tenant.ts'
import { log } from '../kernel/log.ts'
import { members } from '../kernel/members/schema.ts'
import { updateSettings } from '../kernel/settings/settings.ts'
import { tenantCtx } from '../kernel/tenant-ctx.ts'
import { createBankQuestion, listTags, normalizeTags } from '../modules/assessments/question.service.ts'
import { getTemplate, saveTemplate } from '../modules/certificates/service.ts'
import { addLessonBlock, updateLessonBlock } from '../modules/courses/blocks.service.ts'
import { publishCourse, publishLesson } from '../modules/courses/publish.service.ts'
import {
	createCourse,
	createLesson,
	createSection,
	updateCourse,
	updateLessonSettings,
} from '../modules/courses/service.ts'
import { enroll } from '../modules/learning/enrollment.service.ts'
import { createGroup } from '../modules/learning/groups.service.ts'
import { schoolBranding } from '../modules/schools/schema.ts'
import { createSchool, findSchoolBySlug } from '../modules/schools/service.ts'
import { schoolsSettings } from '../modules/schools/settings.ts'
import { type Block, COURSE, QUESTIONS, type Question, SECTIONS, TAGS } from './first-aid.ts'
import { line } from './rich.ts'

export const AIRGORIZONT = {
	slug: 'airgorizont',
	name: 'АИР «Горизонт»',
	password: 'gorizont2026',
	group: 'Первая помощь — ноябрь 2026',
} as const

/** Люди центра: ключ, почта, ФИО, роль. Оператор платформы /ops — отдельная учётная запись. */
export const PEOPLE = {
	owner: { email: 'korev@airgorizont.local', name: 'Корев Денис Александрович', role: 'owner' },
	admin: { email: 'tikhomirov@airgorizont.local', name: 'Тихомиров Дмитрий Сергеевич', role: 'admin' },
	curator: { email: 'ivanov@airgorizont.local', name: 'Иванов Иван Иванович', role: 'curator' },
	student: { email: 'tikhomirova@airgorizont.local', name: 'Тихомирова Анастасия Ильинична', role: 'student' },
} as const satisfies Record<string, { email: string; name: string; role: MemberRole }>
export const OPERATOR = { email: 'ops@airgorizont.local', name: 'Тихомиров Дмитрий Сергеевич' } as const

type Key = keyof typeof PEOPLE
const DAY = 24 * 60 * 60 * 1000

async function ensureUser(email: string, name: string) {
	const [found] = await db.select({ id: users.id }).from(users).where(eq(users.email, email))
	if (found) return found.id
	const res = await auth.api.signUpEmail({ body: { email, password: AIRGORIZONT.password, name } })
	await db.update(users).set({ emailVerified: true }).where(eq(users.id, res.user.id))
	return res.user.id
}

/** Данные вопроса банка по типу (контракты — packages/questions). */
function questionData(q: Question) {
	const common = { prompt: line(q.prompt), explanation: line(q.explain) }
	switch (q.type) {
		case 'single_choice':
			return { ...common, points: 1, options: q.options.map((o, i) => ({ body: line(o), isCorrect: i === q.correct })) }
		case 'multiple_choice':
			return {
				...common,
				points: 2,
				scoring: 'partial',
				options: q.options.map((o, i) => ({ body: line(o), isCorrect: q.correct.includes(i) })),
			}
		case 'text_input':
			return { ...common, points: 1, caseSensitive: false, accepted: q.accepted.map((text) => ({ text })) }
		case 'number':
			return { ...common, points: 1, numberAnswer: q.answer, numberTolerance: q.tolerance }
		case 'ordering':
			return {
				...common,
				points: 2,
				scoring: 'partial',
				steps: q.steps.map((x, i) => ({ body: line(x), correctPosition: i })),
			}
		case 'matching':
			return {
				...common,
				points: 2,
				scoring: 'partial',
				left: q.pairs.map(([l], i) => ({ body: line(l), matchKey: `p${i + 1}` })),
				right: q.pairs.map(([, r], i) => ({ body: line(r), matchKey: `p${i + 1}` })),
			}
		case 'open_text':
			return { ...common, points: q.points }
	}
}

/** Данные блока темы; у теста — вопросы банка по тегам. */
function blockData(spec: Block, bank: { id: string; tag: string }[], tagIds: Map<string, string>) {
	switch (spec.type) {
		case 'heading':
			return { level: spec.level ?? 'h2', text: spec.text }
		case 'text':
			return { body: spec.body }
		case 'callout':
			return { tone: spec.tone, body: spec.body }
		case 'divider':
			return null
		case 'assignment':
			return { prompt: spec.prompt, allowText: true, allowFiles: true, maxFiles: 3, requiresReview: true }
		case 'quiz': {
			const random = spec.random !== undefined
			return {
				selection: random ? 'random_by_tags' : 'fixed',
				randomCount: spec.random ?? 5,
				attemptsLimit: spec.attemptsLimit,
				passScorePct: spec.passScorePct,
				timeLimitSec: spec.timeLimitSec,
				shuffleQuestions: random,
				shuffleOptions: true,
				showCorrect: spec.showCorrect,
				questions: random ? [] : bank.filter((q) => spec.tags.includes(q.tag)).map((q) => ({ questionId: q.id })),
				tags: random ? spec.tags.map((t) => ({ tagId: tagIds.get(normalizeTags([t])[0] as string) as string })) : [],
			}
		}
	}
}

export async function seedAirgorizont(): Promise<{ created: boolean }> {
	if (await findSchoolBySlug(AIRGORIZONT.slug)) return { created: false }

	const ids = {} as Record<Key, string>
	for (const [key, who] of Object.entries(PEOPLE) as [Key, (typeof PEOPLE)[Key]][])
		ids[key] = await ensureUser(who.email, who.name)
	const { school } = await createSchool({ slug: AIRGORIZONT.slug, name: AIRGORIZONT.name }, { userId: ids.owner })

	// оператор консоли /ops (5.6): второй фактор включает сам при первом входе
	const operatorId = await ensureUser(OPERATOR.email, OPERATOR.name)
	await db.update(users).set({ platformRole: 'operator' }).where(eq(users.id, operatorId))

	await withTenant(school.id, async (tx: Tx) => {
		const memberIds = {} as Record<Key, string>
		const [ownerRow] = await tx.select({ id: members.id }).from(members).where(eq(members.userId, ids.owner))
		memberIds.owner = ownerRow?.id as string
		for (const key of ['admin', 'curator', 'student'] as const) {
			const [row] = await tx
				.insert(members)
				.values({ userId: ids[key], role: PEOPLE[key].role })
				.returning({ id: members.id })
			memberIds[key] = row?.id as string
		}
		const as = (key: Key): SchoolCtx => ({
			...tenantCtx(tx, school, { now: () => new Date(), log }),
			user: { id: ids[key], email: PEOPLE[key].email, name: PEOPLE[key].name },
			member: { id: memberIds[key], role: PEOPLE[key].role },
			can: () => true,
		})

		// оформление (5.9) — цвета логотипа airgorizont.ru; реквизиты оператора ПДн слушателей (5.5)
		await tx
			.insert(schoolBranding)
			.values({ schoolId: school.id, primaryColor: '#053d30', accentColor: '#f26d01', font: 'inter' })
		await updateSettings(as('owner'), schoolsSettings, {
			pdOperator:
				'ООО «АИР «Горизонт»» (Академия интеллектуального развития «Горизонт»), г. Москва, ул. Новослободская, д. 20',
			pdContact: 'info_air24@mail.ru',
		})

		// курс собирает администратор
		const author = as('admin')
		const course = await createCourse(author, { title: COURSE.title, description: COURSE.description })
		await updateCourse(author, { id: course.id, defaultAccessMode: 'sequential', accessDays: COURSE.accessDays })
		const bank: { id: string; tag: string }[] = []
		for (const q of QUESTIONS)
			bank.push({
				id: (
					await createBankQuestion(author, { courseId: course.id, type: q.type, data: questionData(q), tags: [q.tag] })
				).id,
				tag: q.tag,
			})
		const tagIds = new Map((await listTags(author, course.id)).map((t) => [t.name, t.id]))
		for (const t of Object.values(TAGS))
			if (!tagIds.has(normalizeTags([t])[0] as string)) throw new Error(`нет тега «${t}» в банке`)

		for (const section of SECTIONS) {
			const s = await createSection(author, { courseId: course.id, title: section.title })
			for (const topic of section.topics) {
				const lesson = await createLesson(author, { sectionId: s.id, title: topic.title })
				for (const spec of topic.blocks) {
					const block = await addLessonBlock(author, { lessonId: lesson.id, type: spec.type })
					const data = blockData(spec, bank, tagIds)
					if (data) await updateLessonBlock(author, { id: block.id, data })
				}
				const graded = topic.blocks.some((x) => x.type === 'quiz' || x.type === 'assignment')
				if (graded || topic.deadlineDays)
					await updateLessonSettings(author, {
						id: lesson.id,
						...(graded ? { completionRule: 'all_blocks' as const } : {}),
						...(topic.deadlineDays ? { deadlineDays: topic.deadlineDays } : {}),
					})
				await publishLesson(author, lesson.id)
			}
		}
		await publishCourse(author, course.id)

		// удостоверение (4.7): выдаётся при прохождении всех тем
		const { courseId, signatureUrl: _s, backgroundUrl: _b, ...fields } = await getTemplate(author, course.id)
		await saveTemplate(author, {
			...fields,
			courseId,
			enabled: true,
			heading: 'Удостоверение',
			body: line(
				'{имя} прошёл(ла) обучение по программе «{курс}» в ООО «АИР «Горизонт»» и успешно сдал(а) проверку знаний. ' +
					'Лицензия на образовательную деятельность № Л035-01298-77/04555721. Дата: {дата}.',
			),
			signerName: PEOPLE.owner.name,
			signerTitle: 'Руководитель учебного центра',
		})

		// учебная группа с куратором; слушатель зачислен в неё, прогресса нет — курс проходят сами
		const now = Date.now()
		const group = await createGroup(author, {
			courseId: course.id,
			title: AIRGORIZONT.group,
			startsAt: new Date(now),
			endsAt: new Date(now + COURSE.accessDays * DAY),
			accessDays: null,
			curatorIds: [memberIds.curator],
		})
		await enroll(author, { memberId: memberIds.student, courseId: course.id, source: 'manual', groupId: group.id })
	})
	return { created: true }
}
